#!/usr/bin/env bash
# Exercises the nested rootless Docker service through fake `s6-setuidgid`,
# `rootlesskit`, `mount` and `umount`, driving the real run script rather than
# a copy of its logic.
#
# Debt the-nested-docker-daemon-loses-the-ownership-an-image-set-on-its-files
# (gh-313): the 0:0 that opened it was the boot's recursive chown of the
# daemon's store, found on 2026-11-17. Nothing here starts a daemon — that is
# core/booted-docker-owners.test.sh. What a script can hold is that the store is
# chowned at its root only, that the storage driver is chosen by the kernel
# probe, that the choice is kept, that a driver that changes re-homes the old
# data-root with one line, that the fallback names the real cause, and that a
# store an older boot damaged is pruned once, keeping its named volumes.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/run"

failures=0
check() {
    if [ "$2" = "$3" ]; then
        echo "ok   $1"
    else
        echo "FAIL $1"
        echo "     expected: $3"
        echo "     got:      $2"
        failures=$((failures + 1))
    fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"

# /dev/fuse exists in the test's world, or the script says disabled and exits.
: > "$work/fuse"

cat > "$work/bin/s6-setuidgid" <<'SH'
#!/usr/bin/env bash
shift
exec "$@"
SH

chars() { printf '%s\n' "$*" >> "$work/rootlesskit-args"; }
cat > "$work/bin/rootlesskit" <<'SH'
#!/usr/bin/env bash
{
    printf 'rootlesskit'
    for a in "$@"; do printf '\n<%s>' "$a"; done
    printf '\n'
} >> "$ROOTLESSKIT_LOG"
exit 0
SH

probe() { # probe ok|fail : what the fake mount answers
    printf '%s\n' "$1" > "$work/mount-answer"
}
# The run script probes with mount/umount in its own process, so the stubs ride
# its PATH: `mount` answers with the probe decision, and both are recorded.
cat > "$work/bin/mount" <<'SH'
#!/usr/bin/env bash
printf 'mount %s\n' "$*" >> "$MOUNT_LOG"
[ "$(cat "$MOUNT_ANSWER")" = "ok" ]
SH
# The run script chowns to abc, who exists in the image but not here; the
# ai-memory service's test stubs chown for the same reason.
cat > "$work/bin/chown" <<'SH'
#!/usr/bin/env bash
printf 'chown %s\n' "$*" >> "$MOUNT_LOG"
exit 0
SH
cat > "$work/bin/umount" <<'SH'
#!/usr/bin/env bash
printf 'umount %s\n' "$*" >> "$MOUNT_LOG"
exit 0
SH
chmod +x "$work/bin/"*

run() { # run <probe> -> echoes rc
    probe "$1"
    : > "$work/mount-calls"; : > "$work/rootlesskit-args"
    DOCKERD_CONFIG_DIR="$work/cfg" \
    DOCKERD_DATA_ROOT="$work/data-root" \
    DOCKERD_RUNTIME_DIR="$work/run" \
    DOCKERD_FUSE_DEV="$work/fuse" \
    PATH="$work/bin:$PATH" \
    ROOTLESSKIT_LOG="$work/rootlesskit-args" \
    MOUNT_LOG="$work/mount-calls" \
    MOUNT_ANSWER="$work/mount-answer" \
        bash "$SCRIPT" > "$work/out" 2>&1
    rc=$?
    [ "$rc" != "0" ] && { echo "[out]"; cat "$work/out"; }; echo "$rc"
}
driver_arg() { sed -n 's/^<--storage-driver=\(.*\)>/\1/p' "$work/rootlesskit-args"; }
line() { grep -F "$1" "$work/out"; }

driverfile="$work/cfg/storage-driver"
probecheck() { # whether volume's chosen driver was recorded the way run said
    [ "$(cat "$driverfile" 2>/dev/null)" = "$1" ]
}

# --- the kernel allows user-namespace overlayfs ------------------------------
r="$(run ok)"
check "the daemon comes up" "$r" "0"
check "dockerd is told overlay2" "$(driver_arg)" "overlay2"
check "the boot says the driver, and why overlay2 stands for the ownership" \
    "$(line 'storage driver: overlay2' >/dev/null && line 'by construction' >/dev/null && echo yes)" "yes"
check "the choice is written for the next boot" "$(probecheck overlay2 && echo yes)" "yes"

# gh-313's root cause: a recursive chown of the data-root rewrote every layer
# in the store to abc, uid 0 in the user namespace, so an image's own owners
# read 0:0 after every boot. The root is abc's; what is under it is the
# daemon's, and the boot leaves it alone.
check "the data-root itself is given to abc" \
    "$(grep -cxF "chown abc:abc $work/data-root" "$work/mount-calls")" "1"
check "and nothing under it is chowned, so the layers keep their owners" \
    "$(grep '^chown -R' "$work/mount-calls" | grep -cF "$work/data-root")" "0"

# A second boot with the choice intact does not rewrite it and says the driver.
r="$(run ok)"
check "a restart keeps overlay2" "$(driver_arg) $(probecheck overlay2 && echo yes)" "overlay2 yes"
check "and it names the driver once, not the change" "( $(line 'storage driver changed' >/dev/null; echo $?) )" "( 1 )"

# --- the kernel does not allow it ---------------------------------------------
r="$(run fail)"
check "with the probe refused, dockerd falls back to fuse-overlayfs" "$(driver_arg)" "fuse-overlayfs"
check "the fallback line names the driver and gh-313's real cause" \
    "$(line 'fuse-overlayfs (the probe could not mount' >/dev/null && line 'recursive chown of the store' >/dev/null && echo yes)" "yes"
check "the fallback is what is recorded" "$(probecheck fuse-overlayfs && echo yes)" "yes"

# --- the driver changes under a data-root already written ---------------------
rm -rf "$work/data-root" "$work/data-root.fuse-overlayfs"; mkdir -p "$work/data-root/images" "$work/data-root/dead"
echo "a build layer" > "$work/data-root/dead/layer"
probe ok
out="$(DOCKERD_CONFIG_DIR="$work/cfg" \
    DOCKERD_DATA_ROOT="$work/data-root" \
    DOCKERD_RUNTIME_DIR="$work/run" \
    DOCKERD_FUSE_DEV="$work/fuse" \
    PATH="$work/bin:$PATH" \
    ROOTLESSKIT_LOG="$work/rootlesskit-args" \
    MOUNT_LOG="$work/mount-calls" \
    MOUNT_ANSWER="$work/mount-answer" \
    bash "$SCRIPT" 2>&1)"
check "a switch re-homes the old data-root instead of starting dockerd over it" \
    "$([ -f "$work/data-root.fuse-overlayfs/dead/layer" ] && echo kept) $([ "$(find "$work/data-root" -mindepth 1 ! -name .pruned-after-gh-313 | wc -l | tr -d ' ')" = "0" ] && echo fresh)" "kept fresh"
check "and one line says where the old one is" \
    "$(printf '%s\n' "$out" | grep -c 'storage driver changed from fuse-overlayfs to overlay2')" "1"
check "with the new choice recorded" "$(probecheck overlay2 && echo yes)" "yes"

# --- a store the old recursive chown damaged is pruned once, volumes kept -------
# Task a-store-damaged-by-the-old-chown-is-pruned-once-keeping-volumes (gh-313).
# Stopping the chown (usj.1) stops new damage; layers it already rewrote stay
# 0:0 until they are gone, and a pull answering "Already exists" keeps them. So
# a store from an older image, the one with no marker, loses everything but its
# named volumes, once, before the daemon starts over it.
MARKER_NAME=".pruned-after-gh-313"
store_from_an_older_image() {
    rm -rf "$work/data-root" "$work/data-root."*
    mkdir -p "$work/data-root/image/overlay2" "$work/data-root/overlay2/abc/diff" \
             "$work/data-root/containers/c1" "$work/data-root/buildkit" \
             "$work/data-root/volumes/pgdata/_data"
    echo "a layer the old chown made 0:0" > "$work/data-root/overlay2/abc/diff/app"
    echo "rows someone cares about" > "$work/data-root/volumes/pgdata/_data/table"
    : > "$work/data-root/volumes/metadata.db"
    echo overlay2 > "$driverfile"
}

store_from_an_older_image
r="$(run ok)"
check "a store with no marker still boots its daemon" "$r" "0"
check "its images, layers, containers and build cache are removed" \
    "$(find "$work/data-root" -mindepth 1 -maxdepth 1 ! -name "$MARKER_NAME" -printf '%f ')" "volumes "
check "its named volume keeps its file" \
    "$(cat "$work/data-root/volumes/pgdata/_data/table" 2>/dev/null)" "rows someone cares about"
check "and the volumes' own metadata" "$([ -f "$work/data-root/volumes/metadata.db" ] && echo kept)" "kept"
check "the marker is written in the data-root" "$([ -f "$work/data-root/$MARKER_NAME" ] && echo yes)" "yes"
check "the boot names what was removed" \
    "$(line 'removed from the docker store:' | grep -c 'buildkit containers image overlay2')" "1"
check "and why, by the chown and the issue" \
    "$(line 'recursive chown' | grep -c 'gh-313')" "1"
check "and that the volumes were kept but may still hold 0:0 files" \
    "$(line 'named volumes were kept' | grep -c '0:0')" "1"

mkdir -p "$work/data-root/image/overlay2"; echo "pulled since" > "$work/data-root/image/overlay2/repositories.json"
r="$(run ok)"
check "the next boot prunes nothing" \
    "$(cat "$work/data-root/image/overlay2/repositories.json" 2>/dev/null)" "pulled since"
check "and says nothing about removing" "$(grep -c 'removed from the docker store' "$work/out")" "0"

rm -rf "$work/data-root"; mkdir -p "$work/data-root"
r="$(run ok)"
check "an empty store is marked" "$([ -f "$work/data-root/$MARKER_NAME" ] && echo yes)" "yes"
check "without a word about removing anything" "$(grep -c 'removed from the docker store' "$work/out")" "0"

# A driver switch moves the old store aside whole and starts an empty one: the
# empty one is marked, and the one moved aside is not touched.
store_from_an_older_image
echo fuse-overlayfs > "$driverfile"
r="$(run ok)"
check "after a driver switch the fresh store is marked, not pruned" \
    "$([ -f "$work/data-root/$MARKER_NAME" ] && echo marked) $(grep -c 'removed from the docker store' "$work/out")" "marked 0"
check "and the store moved aside is left whole" \
    "$([ -f "$work/data-root.fuse-overlayfs/overlay2/abc/diff/app" ] && echo whole)" "whole"

# --- what a shepherd cannot see is named anyway --------------------------------
rm -f "$work/fuse"
# The service sleeps forever on a disabled daemon, which s6 restarts into; the
# test says what was printed and releases the sleep.
out="$(timeout 5 env DOCKERD_CONFIG_DIR="$work/cfg" \
    DOCKERD_DATA_ROOT="$work/data-root" \
    DOCKERD_RUNTIME_DIR="$work/run" \
    DOCKERD_FUSE_DEV="$work/fuse" \
    PATH="$work/bin:$PATH" bash "$SCRIPT" 2>&1)"
check "with no /dev/fuse, the service says it is disabled instead of looping" \
    "$(printf '%s\n' "$out" | grep -c 'nested rootless Docker disabled')" "1"

if [ "$failures" -gt 0 ]; then
    echo "svc-dockerd-rootless.test: $failures failure(s)"
    exit 1
fi
echo "svc-dockerd-rootless.test: the storage driver is chosen by the kernel probe, kept, and a change re-homes the data-root in one line; a store with no marker is pruned once, keeping its volumes."
