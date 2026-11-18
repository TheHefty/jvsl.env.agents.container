#!/usr/bin/env bash
# Exercises review-drop, the real script, with bd stubbed. Debt
# a-task-can-be-closed-without-the-reviews-acceptance (gh-363), task asi.1:
# with the bd wrapper refusing to close a task nobody accepted, an abandoned or
# obsolete task needs an honest way out — on the developer's yes, with a reason,
# and labelled so the history says it was dropped rather than done.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=core/plugin/agent-container/bin/review-stubs.sh
. "$HERE/review-stubs.sh"

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
stubs "$work/bin"
export BD_CALLS="$work/calls"

run() {
    local code=0
    : > "$BD_CALLS"
    REVIEW_BD="$work/bin/bd" REVIEW_TODAY=2026-11-18 bash "$HERE/review-drop" "$@" > "$work/out" 2>&1 || code=$?
    echo "$code"
}
calls() { wc -l < "$BD_CALLS" | tr -d ' '; }

check "a drop with no task id is a usage error" "$(run)" "2"
for why in '' '   '; do
    check "a drop with no reason ($(printf %q "$why")) is refused" "$(run t1 "$why")" "1"
    check "  and nothing is written" "$(calls)" "0"
    check "  saying a reason is what it needs" "$(grep -c 'Say why' "$work/out")" "1"
done

check "a drop with a reason closes the task" "$(run t1 'superseded by asi.2')" "0"
check "it is labelled dropped first, so the gate lets it through" \
    "$(head -n 1 "$BD_CALLS")" "$(printf 'label\tadd\tt1\tdropped')"
check "and closed with the reason, said as a drop" \
    "$(sed -n 2p "$BD_CALLS")" "$(printf 'close\tt1\t--reason\tDropped on 2026-11-18, with the developer'"'"'s yes: superseded by asi.2')"
check "nothing else is written" "$(calls)" "2"
check "it says what it did" "$(grep -c '^t1: dropped' "$work/out")" "1"

# A label that went on and a close that failed leave the task open and labelled:
# said, so nobody reads the label as the close.
cat > "$work/bin/bd" <<'SH'
#!/usr/bin/env bash
(IFS=$'\t'; echo "$*") >> "$BD_CALLS"
[ "$1" = close ] && { echo "Error: database is locked" >&2; exit 1; }
exit 0
SH
check "a close that fails after the label is a failure" "$(run t1 'obsolete')" "1"
check "  that says the task is still open, and labelled" "$(grep -c 'still open' "$work/out")" "1"

if [ "$failures" -gt 0 ]; then
    echo "review-drop.test: $failures failure(s)"
    exit 1
fi
echo "review-drop.test: a task is dropped only with a reason, labelled dropped and closed with it."
