#!/usr/bin/env bash
# Exercises the sandbox-tmp reaper kind, the real script, against a fake /proc
# whose sandboxes have a fake root each.
#
# **What it reaches is each live sandbox's /tmp, from outside it.** ai-jail's
# bwrap mounts a tmpfs of its own on every session's /tmp, in a mount namespace
# the container does not share; the reaper runs in the container, so it goes
# through /proc/<init>/root/tmp. The container's own /tmp is not swept: it
# holds the files ai-jail mounts sandboxes from.
#
# The failures this guards: something live deleted — open, worked in, listened
# on, still being written deep inside, or freshly unpacked with old mtimes; the
# sweep landing in the wrong filesystem — another namespace, the container's,
# a symlink's target, or a reused pid's; and a full /tmp making it loud or
# blind — a line per entry, or one unreachable session stopping the rest.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/sandbox-tmp"

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
proc="$work/proc"
roots="$work/roots"
ME="$(id -u)"
DAY=86400
# Two days ahead of the clock, so every ctime the test creates is old and the
# mtimes set with touch decide. The ctime case moves NOW back to now.
REAL="$(date +%s)"
NOW=$((REAL + 2 * DAY))
SELF_NS='mnt:[4026532224]'
LANDLOCK=(bwrap --args 5 -- /tmp/.ai-jail-landlock --landlock-exec -- claude)

# p pid uid start ns root cmdline...
p() {
    local pid="$1" uid="$2" start="$3" ns="$4" root="$5"; shift 5
    mkdir -p "$proc/$pid/fd" "$proc/$pid/ns" "$proc/$pid/net"
    printf '%s (%s) S 1 %s %s 0 -1 0 0 0 0 0 0 0 0 0 20 0 30 0 %s 0 0\n' \
        "$pid" "$(basename "$1")" "$pid" "$pid" "$start" > "$proc/$pid/stat"
    printf 'Name:\t%s\nUid:\t%s\t%s\t%s\t%s\n' "$1" "$uid" "$uid" "$uid" "$uid" > "$proc/$pid/status"
    printf '%s\0' "$@" > "$proc/$pid/cmdline"
    ln -s "$ns" "$proc/$pid/ns/mnt"
    ln -s "$root" "$proc/$pid/root"
    ln -s / "$proc/$pid/cwd"
    printf 'Num       RefCount Protocol Flags    Type St Inode Path\n' > "$proc/$pid/net/unix"
}
# A sandbox: its init, in a namespace of its own, with a root holding /tmp.
sandbox() {
    # pid ns
    mkdir -p "$roots/$1/tmp"
    p "$1" "$ME" 100 "$2" "$roots/$1" "${LANDLOCK[@]}"
}
fd() { ln -s "$2" "$proc/$1/fd/$(ls "$proc/$1/fd" | wc -l)"; }
cwd() { ln -sfn "$2" "$proc/$1/cwd"; }
listens() { printf '0000000000000000: 00000002 00000000 00010000 0001 01 4242 %s\n' "$2" >> "$proc/$1/net/unix"; }
# entry root name age_seconds [size_kib]
entry() {
    mkdir -p "$1/tmp/$2"
    head -c $((${4:-4} * 1024)) /dev/zero > "$1/tmp/$2/f"
    touch -d "@$((NOW - $3))" "$1/tmp/$2/f" "$1/tmp/$2"
}

reset() { rm -rf "$proc" "$roots"; mkdir -p "$proc" "$roots"; }
reap() {
    local code=0
    REAPER_PROC="$proc" REAPER_NOW="${AT:-$NOW}" REAPER_UID="${AS:-$ME}" \
        REAPER_SELF_NS="$SELF_NS" REAPER_BETWEEN="${BETWEEN:-}" \
        timeout 120 bash "$SCRIPT" > "$work/out" 2> "$work/err" || code=$?
    echo "$code" > "$work/rc"
}
there() { [ -e "$1" ] || [ -L "$1" ] && echo kept || echo removed; }

# --- an old entry nothing holds is removed, and said once per session ------------

reset; sandbox 1810 'mnt:[1]'
entry "$roots/1810" catalogue-a 2*DAY 64
entry "$roots/1810" dist-b 3*DAY 64
reap
check "an entry unchanged for longer than the window is removed" "$(there "$roots/1810/tmp/catalogue-a")" "removed"
check "every such entry is" "$(there "$roots/1810/tmp/dist-b")" "removed"
check "one line for the session" "$(wc -l < "$work/out" | tr -d ' ')" "1"
check "naming the session, how many, how much, and the window" \
    "$(grep -cE '^/tmp of sandbox pid 1810: 2 entries, [0-9.]+K \(unchanged for 24h, nothing holds them\)$' "$work/out")" "1"
check "the kind exits 0" "$(cat "$work/rc")" "0"

reset; sandbox 1810 'mnt:[1]'
reap
check "a session with nothing old says nothing" "$(wc -c < "$work/out" | tr -d ' ') $(cat "$work/rc")" "0 0"

reset
reap
check "no sandbox at all says nothing and exits 0" "$(wc -c < "$work/out" | tr -d ' ') $(cat "$work/rc")" "0 0"

# --- nothing live is deleted -------------------------------------------------------

reset; sandbox 1810 'mnt:[1]'
entry "$roots/1810" recent 3600
reap
check "an entry changed within the window is kept" "$(there "$roots/1810/tmp/recent")" "kept"

reset; sandbox 1810 'mnt:[1]'
entry "$roots/1810" deep 2*DAY
mkdir -p "$roots/1810/tmp/deep/a/b"; : > "$roots/1810/tmp/deep/a/b/written"
touch -d "@$((NOW - 60))" "$roots/1810/tmp/deep/a/b/written"
touch -d "@$((NOW - 2 * DAY))" "$roots/1810/tmp/deep" "$roots/1810/tmp/deep/a" "$roots/1810/tmp/deep/a/b"
reap
check "an old directory with a file still being written deep inside is kept" "$(there "$roots/1810/tmp/deep")" "kept"

# npm stamps every file 1985 and tar keeps the original mtimes; only the ctime
# says the folder was unpacked a minute ago, and touch cannot set that.
reset; sandbox 1810 'mnt:[1]'
entry "$roots/1810" unpacked 2*DAY
touch -d "@$((REAL - 2 * DAY))" "$roots/1810/tmp/unpacked/f" "$roots/1810/tmp/unpacked"
AT=$((REAL + 60)) reap
check "an entry with old mtimes but created within the window is kept" "$(there "$roots/1810/tmp/unpacked")" "kept"

reset; sandbox 1810 'mnt:[1]'
p 1900 "$ME" 200 'mnt:[1]' / node test.js
entry "$roots/1810" open 2*DAY; fd 1900 /tmp/open/f
entry "$roots/1810" worked-in 2*DAY; cwd 1900 /tmp/worked-in
entry "$roots/1810" bare 2*DAY
reap
check "an old entry a sandbox process has open is kept" "$(there "$roots/1810/tmp/open")" "kept"
check "an old entry a sandbox process works in is kept" "$(there "$roots/1810/tmp/worked-in")" "kept"
check "while the bare one beside them is removed" "$(there "$roots/1810/tmp/bare")" "removed"

reset; sandbox 1810 'mnt:[1]'
entry "$roots/1810" ipc 2*DAY; listens 1810 /tmp/ipc/vscode.sock
entry "$roots/1810" '@abstract' 2*DAY; listens 1810 '@/tmp/@abstract'
reap
check "an old entry holding a socket something listens on is kept" "$(there "$roots/1810/tmp/ipc")" "kept"
check "an abstract socket is not mistaken for a path" "$(there "$roots/1810/tmp/@abstract")" "removed"

reset; sandbox 1810 'mnt:[1]'
entry "$roots/1810" claude-1000 30*DAY
: > "$roots/1810/tmp/.ai-jail-landlock"; touch -d "@$((NOW - 30 * DAY))" "$roots/1810/tmp/.ai-jail-landlock"
entry "$roots/1810" .hidden-old 2*DAY
reap
check "the agent's own directory is kept however old" "$(there "$roots/1810/tmp/claude-1000")" "kept"
check "the sandbox's launcher is kept however old" "$(there "$roots/1810/tmp/.ai-jail-landlock")" "kept"
check "an ordinary hidden entry is not spared by its dot" "$(there "$roots/1810/tmp/.hidden-old")" "removed"

# Another user: the sandbox and its files are abc's, the reaper runs as 4242.
reset; sandbox 1810 'mnt:[1]'
sed -i 's/^Uid:.*/Uid:\t4242\t4242\t4242\t4242/' "$proc/1810/status"
entry "$roots/1810" theirs 2*DAY
AS=4242 reap
check "an entry another user owns is kept" "$(there "$roots/1810/tmp/theirs")" "kept"

# --- it never sweeps the wrong filesystem ------------------------------------------

reset
mkdir -p "$roots/pg/tmp"; entry "$roots/pg" pgdata 2*DAY
p 3000 "$ME" 100 'mnt:[9]' "$roots/pg" postgres -D /var/lib/postgresql/data
reap
check "an abc namespace that is not an ai-jail sandbox is untouched" "$(there "$roots/pg/tmp/pgdata")" "kept"

reset
mkdir -p "$roots/flatpak/tmp"; entry "$roots/flatpak" app-cache 2*DAY
p 3100 "$ME" 100 'mnt:[8]' "$roots/flatpak" bwrap --args 5 -- /app/bin/editor
reap
check "a bwrap that is not ai-jail's does not make its namespace a sandbox" "$(there "$roots/flatpak/tmp/app-cache")" "kept"

reset
mkdir -p "$roots/container/tmp"; entry "$roots/container" ai-jail-deny-dir.1804.1 2*DAY
p 1809 "$ME" 100 "$SELF_NS" "$roots/container" "${LANDLOCK[@]}"
reap
check "the outer bwrap, in the container's namespace, does not make the container's /tmp a sandbox's" \
    "$(there "$roots/container/tmp/ai-jail-deny-dir.1804.1")" "kept"

reset; sandbox 1810 'mnt:[1]'
mkdir -p "$work/outside"; : > "$work/outside/precious"
ln -s "$work/outside" "$roots/1810/tmp/link"; touch -h -d "@$((NOW - 2 * DAY))" "$roots/1810/tmp/link"
reap
check "an old symlink is removed as a link" "$(there "$roots/1810/tmp/link")" "removed"
check "and what it pointed at is kept" "$(there "$work/outside/precious")" "kept"

# Between the scan and entering its /tmp, the init is gone and its pid reused
# by a process whose root is somewhere else.
reset; sandbox 1810 'mnt:[1]'
entry "$roots/1810" stale 2*DAY
BETWEEN="sed -i 's/ 100 0 0\$/ 999 0 0/' '$proc/1810/stat'" reap
check "a sandbox whose init changed since the scan is not swept" "$(there "$roots/1810/tmp/stale")" "kept"

# --- a full /tmp makes it neither loud nor blind -----------------------------------

reset; sandbox 1810 'mnt:[1]'
for i in $(seq 3000); do mkdir "$roots/1810/tmp/build-$i"; done
touch -d "@$((NOW - 2 * DAY))" "$roots/1810/tmp"/build-*
reap
check "three thousand stale entries are all removed" "$(ls "$roots/1810/tmp" | wc -l | tr -d ' ')" "0"
check "and give one line, not three thousand" "$(wc -l < "$work/out" | tr -d ' ')" "1"
check "which counts them" "$(grep -c ': 3000 entries, ' "$work/out")" "1"

# Both ways round: the order sessions are visited in is not fixed, and a sweep
# that stopped at the first failure would pass whichever order put it last.
for pair in '1810 2273' '2273 1810'; do
    read -r bad good <<<"$pair"
    reset; sandbox 1810 'mnt:[1]'; sandbox 2273 'mnt:[2]'
    entry "$roots/$good" stale 2*DAY
    rm -rf "${proc:?}/$bad/root"; ln -s "$work/gone" "$proc/$bad/root"
    reap
    check "a session it cannot enter ($bad) does not stop the others" "$(there "$roots/$good/tmp/stale")" "removed"
    check "the other's sweep is on stdout" "$(grep -c "^/tmp of sandbox pid $good: 1 entries" "$work/out")" "1"
    check "the kind exits 1, so the frame says it once" "$(cat "$work/rc")" "1"
    check "naming the session it could not enter, as its last line" \
        "$(tail -n 1 "$work/err" | grep -c "could not enter the /tmp of sandbox pid $bad")" "1"
done

reset; sandbox 1810 'mnt:[1]'
p 1811 "$ME" 100 'mnt:[1]' "$roots/1810" "${LANDLOCK[@]}"
entry "$roots/1810" stale 2*DAY
reap
check "two inits in one namespace are one session, swept once" "$(wc -l < "$work/out" | tr -d ' ')" "1"

if [ "$failures" -gt 0 ]; then
    echo "reapers/sandbox-tmp.test: $failures failure(s)"
    exit 1
fi
echo "reapers/sandbox-tmp.test: old, unheld entries go from every sandbox's /tmp in one line per session; live, recent, own and other namespaces' are kept."
