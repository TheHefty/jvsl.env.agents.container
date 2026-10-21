#!/usr/bin/env bash
# Exercises the browser-tests reaper kind, the real script, against a fake
# /proc, a fake /tmp and a stand-in for kill.
#
# **The criterion is the process group.** A test run's processes share the
# group of whatever started it, and keep it when they are re-parented, so a run
# that died leaves a group whose leader is gone. Such a group is a browser-test
# leftover only when it carries an automation marker — a chromedriver, a Chrome
# started with --enable-automation, a WebdriverIO worker. PPID 1 is not used:
# inside the agent's sandbox an orphan is re-parented to the sandbox's init,
# not to PID 1, and every disowned dev server has PPID 1.
#
# The failures this guards: a live run or a person's dev server stopped; a
# profile deleted while a browser uses it, or anything deleted outside the
# pattern; a pid signalled after it was reused by something else.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/browser-tests"

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
tmp="$work/tmp"
ME=911
NOW=2000000000

# kill stand-in: records `SIG pid`. A TERM makes the process exit unless it is
# listed as stubborn; a KILL always does.
cat > "$work/kill" <<'SH'
#!/usr/bin/env bash
sig="${1#-}"; pid="$2"
echo "$sig $pid" >> "$SIGNALS"
if [ "$sig" = KILL ] || ! grep -qx "$pid" "$STUBBORN" 2>/dev/null; then
    rm -rf "${PROC:?}/$pid"
fi
SH
chmod +x "$work/kill"

# p pid comm ppid pgrp uid start cmdline...
p() {
    local pid="$1" comm="$2" ppid="$3" pgrp="$4" uid="$5" start="$6"; shift 6
    mkdir -p "$proc/$pid/fd"
    printf '%s (%s) S %s %s %s 0 -1 0 0 0 0 0 0 0 0 0 20 0 30 0 %s 0 0\n' \
        "$pid" "$comm" "$ppid" "$pgrp" "$pgrp" "$start" > "$proc/$pid/stat"
    printf 'Name:\t%s\nUid:\t%s\t%s\t%s\t%s\n' "$comm" "$uid" "$uid" "$uid" "$uid" > "$proc/$pid/status"
    printf '%s\0' "$@" > "$proc/$pid/cmdline"
    ln -s / "$proc/$pid/cwd"
}
fd() { ln -s "$2" "$proc/$1/fd/$(ls "$proc/$1/fd" | wc -l)"; }
cwd() { ln -sfn "$2" "$proc/$1/cwd"; }

# A dead WebdriverIO run: its launcher (pid 1000, the group's leader) is gone.
dead_run() {
    p 1001 node 1 1000 $ME 100 node /p/node_modules/@wdio/local-runner/build/run.js
    p 1002 chromedriver 1 1000 $ME 100 /home/x/.cache/chromedriver --port=9515
    p 1003 chrome 1002 1000 $ME 100 /home/x/.cache/chrome/chrome --enable-automation --user-data-dir=/tmp/.org.chromium.Chromium.live
    p 1004 node 1 1000 $ME 100 node /p/node_modules/.bin/vite preview --port 4173
}
profile() {
    # name age_seconds
    mkdir -p "$tmp/$1"; head -c 4096 /dev/zero > "$tmp/$1/Cookies"
    touch -d "@$((NOW - $2))" "$tmp/$1"
}

reset() { rm -rf "$proc" "$tmp" "$work/signals" "$work/stubborn"; mkdir -p "$proc" "$tmp"; : > "$work/signals"; }
reap() {
    local code=0
    PROC="$proc" SIGNALS="$work/signals" STUBBORN="$work/stubborn" \
        REAPER_PROC="$proc" REAPER_TMP="$tmp" REAPER_KILL="$work/kill" REAPER_GRACE=1 \
        REAPER_NOW="$NOW" REAPER_UID="$ME" REAPER_BETWEEN="${BETWEEN:-}" \
        timeout 60 bash "$SCRIPT" > "$work/out" 2> "$work/err" || code=$?
    echo "$code" > "$work/rc"
}
signalled() { awk '{print $2}' "$work/signals" | sort -u | tr '\n' ' '; }

# --- a dead run is stopped ------------------------------------------------------

reset; dead_run
reap
check "a dead run's runner, chromedriver, Chrome and vite are all stopped" "$(signalled)" "1001 1002 1003 1004 "
check "each was asked first" "$(grep -c '^TERM' "$work/signals")" "4"
check "and none needed forcing" "$(grep -c '^KILL' "$work/signals" || true)" "0"
check "one line each" "$(wc -l < "$work/out" | tr -d ' ')" "4"
check "naming the process, its pid, and why" \
    "$(grep -c '^chromedriver pid 1002 (its run is gone: group 1000 lost its leader and drove a browser)$' "$work/out")" "1"
check "the kind exits 0" "$(cat "$work/rc")" "0"

reset; dead_run; echo 1003 > "$work/stubborn"
reap
check "a process that ignores TERM is forced after the grace period" "$(grep -c '^KILL 1003$' "$work/signals")" "1"

# --- live runs and dev servers are never touched ----------------------------------

reset; dead_run; p 1000 node 900 1000 $ME 90 node /p/node_modules/.bin/wdio run wdio.conf.ts
reap
check "a run whose leader is alive is untouched" "$(signalled)" ""

reset
p 2001 node 1 2000 $ME 100 node /p/node_modules/.bin/vite --port 5174
reap
check "a vite whose group lost its leader but never drove a browser is untouched" "$(signalled)" ""

reset
p 3000 node 1 3000 $ME 100 node /p/node_modules/.bin/vite preview --port 4173
reap
check "a vite left running on purpose leads its own group, and is untouched" "$(signalled)" ""

reset
p 1002 chromedriver 1 1000 1000 100 /home/x/.cache/chromedriver
p 1003 chrome 1 1000 1000 100 /opt/chrome --enable-automation
reap
check "another user's processes are never touched" "$(signalled)" ""

reset; dead_run
p 1005 bash 1 1000 $ME 100 bash -c 'sleep 9999'
reap
check "of a dead group, only the known kinds are stopped, not whatever else it holds" \
    "$(grep -c ' 1005$' "$work/signals" || true)" "0"

# --- a reused pid is not signalled ----------------------------------------------

reset; dead_run
# Between the scan and the signal, pid 1002 is gone and the number reused.
BETWEEN="rm -rf '$proc/1002'; mkdir -p '$proc/1002'; printf '1002 (sshd) S 1 1002 1002 0 -1 0 0 0 0 0 0 0 0 0 20 0 30 0 999 0 0\n' > '$proc/1002/stat'" reap
check "a pid whose start time changed since the scan is not signalled" "$(grep -c ' 1002$' "$work/signals" || true)" "0"
check "the rest of the run still is" "$(signalled)" "1001 1003 1004 "

# --- profiles ---------------------------------------------------------------------

reset
profile .org.chromium.Chromium.dead 3600
profile .com.google.Chrome.dead 3600
profile puppeteer_dev_chrome_profile-dead 3600
reap
check "profiles nothing uses are removed" "$(ls -A "$tmp" | tr '\n' ' ')" ""
check "with their size in the line" \
    "$(grep -cE '^/.*/\.org\.chromium\.Chromium\.dead \([0-9.]+[KMG]?, no process has it open\)$' "$work/out")" "1"

reset
profile .org.chromium.Chromium.fd 3600; profile .org.chromium.Chromium.cwd 3600; profile .org.chromium.Chromium.arg 3600
p 4001 chrome 4000 4000 $ME 100 /opt/chrome; fd 4001 "$tmp/.org.chromium.Chromium.fd/Cookies"
p 4002 chrome 4000 4000 $ME 100 /opt/chrome; cwd 4002 "$tmp/.org.chromium.Chromium.cwd"
p 4003 chrome 4000 4000 $ME 100 /opt/chrome "--user-data-dir=$tmp/.org.chromium.Chromium.arg"
p 4000 node 1 4000 $ME 90 node wdio
reap
check "a profile held by an fd, a cwd, or a --user-data-dir is kept" "$(ls -A "$tmp" | sort | tr '\n' ' ')" \
    ".org.chromium.Chromium.arg .org.chromium.Chromium.cwd .org.chromium.Chromium.fd "

reset
profile .org.chromium.Chromium.young 60
reap
check "a profile younger than ten minutes is kept: its browser may be starting" "$(ls -A "$tmp")" ".org.chromium.Chromium.young"

reset
mkdir -p "$work/elsewhere"; echo keep > "$work/elsewhere/file"
ln -s "$work/elsewhere" "$tmp/.org.chromium.Chromium.link"; touch -h -d "@$((NOW - 3600))" "$tmp/.org.chromium.Chromium.link"
profile not-a-profile 3600
mkdir -p "$tmp/sub"; profile sub/.org.chromium.Chromium.deep 3600
reap
check "a symlink matching the pattern is not followed, and what it points at survives" "$(cat "$work/elsewhere/file")" "keep"
check "names outside the pattern, and anything below /tmp's top level, are kept" \
    "$(n=0; for f in "$tmp/not-a-profile" "$tmp/sub/.org.chromium.Chromium.deep" "$tmp/.org.chromium.Chromium.link"; do
         [ -e "$f" ] || [ -L "$f" ] && n=$((n + 1)); done; echo "$n")" "3"

if [ "$failures" -gt 0 ]; then
    echo "reapers/browser-tests.test: $failures failure(s)"
    exit 1
fi
echo "reapers/browser-tests.test: a dead run's browser, driver, runner and vite are stopped, asked before forced; live runs, dev servers, other users and reused pids are not; unused profiles go and used ones stay."
