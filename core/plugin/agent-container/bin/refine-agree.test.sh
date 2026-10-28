#!/usr/bin/env bash
# Exercises refine-agree and refine-reject, the real scripts, with bd stubbed.
#
# Agreement is both halves in one step, or it leaves a draft on the board or
# work bd ready never lists (the rules, "The work tracker"); a rejection is a
# close with its reason, never a delete, so the same draft does not come back.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=core/plugin/agent-container/bin/daily-fixture.sh
. "$HERE/daily-fixture.sh"
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
EXPORT="$work/export.jsonl"

item p-task task deferred 2 '["proposed"]' "c"
item p-story feature deferred 2 '["proposed"]' "Scenario: x"
item p-nocrit task deferred 2 '["proposed"]'
item half-label task open 2 '["proposed"]' "c"
item half-defer task deferred 2 null "c"
item agreed task open 2 null "c"
item gone task closed 2 '["proposed"]' "c"

run() {
    local script="$1" code=0; shift
    : > "$BD_CALLS"
    DAILY_EXPORT="$EXPORT" REVIEW_BD="$work/bin/bd" bash "$HERE/$script" "$@" > "$work/out" 2>&1 || code=$?
    echo "$code"
}
calls() { wc -l < "$BD_CALLS" | tr -d ' '; }
has() { grep -c "$1" "$BD_CALLS" || true; }

check "a proposed task with a criterion is agreed" "$(run refine-agree p-task)" "0"
check "undeferred" "$(has $'^undefer\tp-task$')" "1"
check "and unlabelled, in the same step" "$(has $'^label\tremove\tp-task\tproposed$')" "1"
check "a proposed story is agreed the same way" "$(run refine-agree p-story) $(has $'^undefer\tp-story$') $(has $'^label\tremove\tp-story\tproposed$')" "0 1 1"
check "a half-proposal, only labelled, is completed rather than left half" "$(run refine-agree half-label) $(has $'^label\tremove\thalf-label\tproposed$') $(has '^undefer' )" "0 1 0"
check "a half-proposal, only deferred, too" "$(run refine-agree half-defer) $(has $'^undefer\thalf-defer$') $(has '^label')" "0 1 0"

check "a proposed task with no criterion is refused, writing nothing" "$(run refine-agree p-nocrit) $(calls)" "1 0"
check "an item that is not a proposal is refused" "$(run refine-agree agreed) $(calls)" "1 0"
check "a closed one too" "$(run refine-agree gone) $(calls)" "1 0"
check "an id the tracker does not have too" "$(run refine-agree ghost) $(calls)" "1 0"

BD_SHOW='[{"status":"open","labels":["proposed"]}]' run refine-agree p-task > "$work/rc"
check "an agreement bd left by halves is caught, not reported as done" "$(cat "$work/rc") $(grep -c 'still' "$work/out")" "1 1"

check "a rejection with no reason is refused, writing nothing" "$(run refine-reject p-task '  ') $(calls)" "1 0"
check "a rejection closes, with its reason" "$(run refine-reject p-task 'covered by the review story')" "0"
check "as a close carrying the reason" "$(has $'^close\tp-task\t--reason\tRejected in refinement: covered by the review story$')" "1"
check "and never a delete" "$(has '^delete')" "0"

if [ "$failures" -gt 0 ]; then
    echo "refine-agree.test: $failures failure(s)"
    exit 1
fi
echo "refine-agree.test: agreement is both halves or nothing, and a rejection is a close with its reason."
