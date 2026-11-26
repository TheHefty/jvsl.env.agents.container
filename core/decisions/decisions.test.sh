#!/usr/bin/env bash
# Drives the real decisions.sh, the helper the boot hooks and the reaper share
# to write what they decided to one log (story djy.1, task djy.1.1).
#
# Its three worst failures, each a case below:
#   1. a root-owned log: the hooks run as root at boot, and a log they create as
#      root is one the reaper, running as abc, can no longer append to — its
#      lines vanish with nothing saying so. Every write goes through the prefix
#      the caller names;
#   2. a log that grows without end, or a third file: one log and one .1, both
#      under the bound;
#   3. a log that cannot be written takes the caller down with it: the hooks run
#      under `set -e`, and a boot hook that dies leaves the editor's settings
#      unwritten for a line nobody would have read.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HERE/decisions.sh"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
cat > "$work/bin/s6-setuidgid" <<'SH'
#!/usr/bin/env bash
echo "as $1: ${*:2}" >> "$CALLS"
shift
exec "$@"
SH
chmod +x "$work/bin/s6-setuidgid"
export CALLS="$work/calls"
: > "$CALLS"

log="$work/state/jvsl/decisions.log"

# Runs a caller that sources the helper under set -e, as the hooks do, records
# decisions, and says it got to the end.
caller() {
    DECISIONS_LOG="$1" DECISIONS_LOG_MAX="${2:-262144}" DECISIONS_WRITE_AS="${3:-}" PATH="$work/bin:$PATH" \
        bash -c 'set -euo pipefail; . "$0"; for line in "$@"; do decision test-hook "$line"; done; echo reached-the-end' \
        "$LIB" "${@:4}"
}

# --- a line carries the time, who decided, and what ------------------------------

out="$(caller "$log" 262144 "" "wrote java.server.launchMode: new from the image")"
check "the caller goes on" "$out" "reached-the-end"
check "the folder is created" "$([ -d "$(dirname "$log")" ] && echo yes || echo no)" "yes"
check "one line: time, who, what" \
    "$(grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z test-hook: wrote java.server.launchMode: new from the image$' "$log")" "1"
check "nothing on stdout but the caller's own" "$out" "reached-the-end"

# --- 1. every write goes through the prefix the caller names ---------------------

rm -rf "$work/state"; : > "$CALLS"
caller "$log" 262144 "s6-setuidgid abc" "kept editor.fontSize" >/dev/null
check "the line is written" "$(grep -c 'kept editor.fontSize' "$log")" "1"
check "creating the folder as abc" "$(grep -c "^as abc: mkdir -p $(dirname "$log")$" "$CALLS")" "1"
check "and appending as abc" "$(grep -c "^as abc: tee -a $log$" "$CALLS")" "1"
check "and nothing as anyone else" "$(grep -vc '^as abc:' "$CALLS" || true)" "0"

# --- 2. one log and one .1, both under the bound -----------------------------------

rm -rf "$work/state"; : > "$CALLS"
lines=(); for i in $(seq 200); do lines+=("reaped browser pid $i (its run is gone)"); done
caller "$log" 2048 "s6-setuidgid abc" "${lines[@]}" >/dev/null
check "the log stays under its bound" "$([ "$(stat -c %s "$log")" -le 2048 ] && echo yes || echo "no: $(stat -c %s "$log")")" "yes"
check "so does the .1" "$([ "$(stat -c %s "$log.1")" -le 2048 ] && echo yes || echo "no: $(stat -c %s "$log.1")")" "yes"
check "and there is never a third file" "$(ls "$(dirname "$log")" | tr '\n' ' ')" "decisions.log decisions.log.1 "
check "the newest decision is in the log" "$(tail -n 1 "$log" | grep -c 'pid 200 ')" "1"
check "the rotation ran as abc too" "$(grep -c "^as abc: mv -f $log $log.1$" "$CALLS" | awk '{print ($1 > 0) ? "yes" : "no"}')" "yes"

# --- 3. a log that cannot be written never stops the caller --------------------------

touch "$work/a-file"
out="$(caller "$work/a-file/decisions.log" 262144 "" "wrote x" 2>"$work/err")" || out="exited $?"
check "a folder that cannot be made does not stop the caller" "$out" "reached-the-end"
check "and is said on stderr, naming the log" "$(grep -cF "$work/a-file/decisions.log" "$work/err")" "1"

if [ "$failures" -gt 0 ]; then echo "decisions.test: $failures failure(s)"; exit 1; fi
echo "decisions.test: a decision is one line with its time and who, written as the caller names, bounded to a log and its .1, and never the reason a caller stops."
