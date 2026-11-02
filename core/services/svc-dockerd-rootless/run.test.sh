#!/usr/bin/env bash
# Exercises the nested rootless Docker service through fake `s6-setuidgid`,
# `rootlesskit`, `mount` and `umount`, driving the real run script rather than
# a copy of its logic.
#
# Debt the-nested-docker-daemon-loses-the-ownership-an-image-set-on-its-files
# (gh-313): fuse-overlayfs inside the nested daemon hands out 0:0 where the
# image dropped its own owner, and the container restarts in a loop while
# compose up exits 0. Nothing here starts a daemon: what a script can hold is
# that the storage driver is chosen by the kernel probe, that the choice is
# kept, that a driver that changes re-homes the old data-root with one line,
# and that the fallback names itself.
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
    "$(line 'storage driver: overlay2' >/dev/null && echo yes)" "yes"
check "the choice is written for the next boot" "$(probecheck overlay2 && echo yes)" "yes"

# A second boot with the choice intact does not rewrite it and says the driver.
r="$(run ok)"
check "a restart keeps overlay2" "$(driver_arg) $(probecheck overlay2 && echo yes)" "overlay2 yes"
check "and it names the driver once, not the change" "( $(line 'storage driver changed' >/dev/null; echo $?) )" "( 1 )"

# --- the kernel does not allow it ---------------------------------------------
r="$(run fail)"
check "with the probe refused, dockerd falls back to fuse-overlayfs" "$(driver_arg)" "fuse-overlayfs"
check "the fallback line names the driver and the ownership it loses" \
    "$(line 'fuse-overlayfs (the probe could not mount' >/dev/null && line 'loses an image' >/dev/null && echo yes)" "yes"
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
    "$([ -f "$work/data-root.fuse-overlayfs/dead/layer" ] && echo kept) $([ "$(find "$work/data-root" -mindepth 1 | wc -l | tr -d ' ')" = "0" ] && echo fresh)" "kept fresh"
check "and one line says where the old one is" \
    "$(printf '%s\n' "$out" | grep -c 'storage driver changed from fuse-overlayfs to overlay2')" "1"
check "with the new choice recorded" "$(probecheck overlay2 && echo yes)" "yes"

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
echo "svc-dockerd-rootless.test: the storage driver is chosen by the kernel probe, kept, and a change re-homes the data-root in one line."
