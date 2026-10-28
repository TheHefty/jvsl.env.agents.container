#!/usr/bin/env bash
# Exercises the reaper service, driving the real run script through a fake
# `s6-setuidgid` and stub kinds, with a short interval and a fixed number of
# passes so it ends.
#
# The kinds — Testcontainers, browser tests, orphaned JVMs — are their own
# stories, each with the judgement of what counts as orphaned. What this owns is
# the frame they share, and its three worst failures: a log that grows without
# end or speaks when nothing happened, a failing kind that floods or makes s6
# restart the service until the reason scrolls away, and an off switch read
# wrongly in either direction.
set -euo pipefail

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
mkdir -p "$work/bin" "$work/kinds"

# `s6-setuidgid abc <cmd>...`: records the user, then runs the rest.
cat > "$work/bin/s6-setuidgid" <<'SH'
#!/usr/bin/env bash
echo "$1" > "$REAPER_TEST_USER"
shift
exec "$@"
SH
chmod +x "$work/bin/s6-setuidgid"

kinds="$work/kinds"
log="$work/state/reaper.log"
manifest="$work/manifest.json"

# A kind that reaps one thing per call, and records that it was called.
reaps_one() {
    cat > "$kinds/$1" <<SH
#!/usr/bin/env bash
echo called >> "$work/calls-$1"
echo "postgres:18-alpine container 3f2a (exited 39h, session gone)"
SH
    chmod +x "$kinds/$1"
}
finds_nothing() {
    cat > "$kinds/$1" <<SH
#!/usr/bin/env bash
echo called >> "$work/calls-$1"
SH
    chmod +x "$kinds/$1"
}
# Fails while $work/broken exists, the way a kind does when docker is down.
fails_while_broken() {
    cat > "$kinds/$1" <<SH
#!/usr/bin/env bash
echo called >> "$work/calls-$1"
if [ -e "$work/broken" ]; then
    echo "some noise first" >&2
    echo "docker did not answer at unix:///config/.docker/run/docker.sock" >&2
    exit 1
fi
SH
    chmod +x "$kinds/$1"
}

# Runs the real script for N passes. Returns its exit code in $work/rc and its
# stdout (what s6 would send to docker logs) in $work/out.
run_passes() {
    local code=0
    REAPER_TEST_USER="$work/user" PATH="$work/bin:$PATH" \
        REAPER_KINDS_DIR="$kinds" REAPER_LOG="$log" REAPER_MANIFEST="$manifest" \
        REAPER_INTERVAL=0 REAPER_PASSES="$1" REAPER_LOG_MAX="${LOG_MAX:-262144}" \
        timeout 60 bash "$SCRIPT" > "$work/out" 2>&1 || code=$?
    echo "$code" > "$work/rc"
}
reset() { rm -rf "$kinds" "$work/state" "$work"/calls-* "$work/broken" "$manifest"; mkdir -p "$kinds"; }
calls() { [ -f "$work/calls-$1" ] && wc -l < "$work/calls-$1" | tr -d ' ' || echo 0; }
lines() { [ -f "$1" ] && wc -l < "$1" | tr -d ' ' || echo 0; }

# --- it runs, as abc, and says each reap once in both places -------------------

reset; reaps_one testcontainers
run_passes 1
check "the service drops to abc before running anything" "$(cat "$work/user")" "abc"
check "a pass calls each kind" "$(calls testcontainers)" "1"
check "a reap is one line in the log file" "$(lines "$log")" "1"
check "the line names the kind, what, and why" \
    "$(grep -c 'testcontainers: reaped postgres:18-alpine container 3f2a (exited 39h, session gone)' "$log")" "1"
check "the line carries a timestamp" "$(grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+' "$log")" "1"
check "and the same line goes to stdout, for docker logs" \
    "$(grep -c 'testcontainers: reaped postgres' "$work/out")" "1"

# --- a pass that finds nothing says nothing -------------------------------------

reset; finds_nothing browsers
run_passes 3
check "three empty passes call the kind three times" "$(calls browsers)" "3"
check "and write nothing to the log" "$([ -s "$log" ] && echo written || echo empty)" "empty"
check "and nothing to stdout" "$(grep -c . "$work/out" || true)" "0"

# --- the log is bounded ---------------------------------------------------------

reset; reaps_one testcontainers
LOG_MAX=2048 run_passes 200
check "two hundred reaps all happened" "$(calls testcontainers)" "200"
check "the log file stays under its bound" \
    "$([ "$(stat -c %s "$log")" -le 2048 ] && echo yes || echo "no: $(stat -c %s "$log")")" "yes"
check "one rotated file is kept, and it is bounded too" \
    "$([ "$(stat -c %s "$log.1")" -le 2048 ] && echo yes || echo no)" "yes"
check "and there is never a second one" "$(ls "$work/state" | sort | tr '\n' ' ')" "reaper.log reaper.log.1 "

# --- a failing kind is said once, the loop survives, recovery is said once --------

reset; fails_while_broken testcontainers; reaps_one jvms; touch "$work/broken"
run_passes 5
check "a kind that fails every pass is still called every pass" "$(calls testcontainers)" "5"
check "the other kinds keep running beside it" "$(calls jvms)" "5"
check "the loop did not exit, so s6 has nothing to restart" "$(cat "$work/rc")" "0"
check "the failure is said once, not five times" "$(grep -c 'testcontainers: could not run' "$log")" "1"
check "with the kind's own last line as the reason" \
    "$(grep -c 'testcontainers: could not run: docker did not answer at unix:///config/.docker/run/docker.sock' "$log")" "1"

# Recovery, in a second run that starts broken and is mended between passes.
reset; touch "$work/broken"
cat > "$kinds/testcontainers" <<SH
#!/usr/bin/env bash
n=\$(( \$(cat "$work/n" 2>/dev/null || echo 0) + 1 )); echo "\$n" > "$work/n"
[ "\$n" -le 2 ] && { echo "docker did not answer" >&2; exit 1; }
exit 0
SH
chmod +x "$kinds/testcontainers"; rm -f "$work/n"
run_passes 5
check "a kind that recovers is said once to have recovered" "$(grep -c 'testcontainers: running again' "$log")" "1"
check "and its failure was still said only once" "$(grep -c 'testcontainers: could not run' "$log")" "1"

# A kind that reaped some things and then failed on others — the sandbox-tmp
# kind sweeping one sandbox and unable to enter another. What it did is done,
# and a reap nobody logged is a disk that emptied with nothing saying why.
reset
cat > "$kinds/sandbox-tmp" <<SH
#!/usr/bin/env bash
echo "/tmp of sandbox pid 1810: 3 entries, 12M (unchanged for 24h, nothing holds them)"
echo "could not enter the /tmp of sandbox pid 2273" >&2
exit 1
SH
chmod +x "$kinds/sandbox-tmp"
run_passes 3
check "what a failing kind reaped before failing is logged, every pass it reaps" \
    "$(grep -c 'sandbox-tmp: reaped /tmp of sandbox pid 1810: 3 entries' "$log")" "3"
check "and its failure is still said only once" \
    "$(grep -c 'sandbox-tmp: could not run: could not enter the /tmp of sandbox pid 2273' "$log")" "1"

# --- the off switch -------------------------------------------------------------

for case in 'off|{"reaper": false}|0' \
            'explicit on|{"reaper": true}|2' \
            'missing key|{"node": "22"}|2' \
            'malformed|{"reaper": fals|2' \
            'a string "false" is not false|{"reaper": "false"}|2'; do
    IFS='|' read -r name json want <<<"$case"
    reset; reaps_one testcontainers; printf '%s' "$json" > "$manifest"
    run_passes 2
    check "manifest $name: the kinds are called $want times in two passes" "$(calls testcontainers)" "$want"
done

reset; reaps_one testcontainers
run_passes 2
check "no manifest at all: on" "$(calls testcontainers)" "2"

reset; reaps_one testcontainers; printf '{"reaper": false}' > "$manifest"
run_passes 3
check "off is said once, not every pass" "$(grep -c 'off' "$log")" "1"
check "and names the key that turned it off" "$(grep -c '"reaper": false' "$log")" "1"

reset; reaps_one testcontainers; printf '{"reaper": fals' > "$manifest"
run_passes 3
check "an unreadable manifest is said once, and the reaper stays on" \
    "$(grep -c 'could not read' "$log") $(calls testcontainers)" "1 3"

# No kinds installed is what this story ships: it must be quiet, not an error.
reset
run_passes 3
check "with no kinds installed, nothing is written and nothing fails" \
    "$(cat "$work/rc") $([ -s "$log" ] && echo written || echo empty)" "0 empty"

if [ "$failures" -gt 0 ]; then
    echo "svc-reaper/run.test: $failures failure(s)"
    exit 1
fi
echo "svc-reaper/run.test: each reap is one line in a bounded log and on stdout, empty passes are silent, a failing kind is said once and never stops the loop, and only an explicit \"reaper\": false turns it off."
