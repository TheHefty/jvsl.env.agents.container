#!/usr/bin/env bash
# Exercises planning-check, the real script, against a fixture `bd export`.
#
# It is what stands between the developer's choice in a planning and a claim: a
# task it lets through is started that day. The failure it guards is the worst
# one the ceremony has — starting something nobody agreed, which is the gate
# the whole chain exists for (story the-planning).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/planning-check"
# shellcheck source=core/plugin/agent-container/bin/tracker-fixture.sh
. "$HERE/tracker-fixture.sh"

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
EXPORT="$work/export.jsonl"

item s1 feature open 2 null "Scenario: x"
item t-ok task open 2 null "the brief lists it"
dep t-ok s1 parent-child
item t-proposed task deferred 2 '["proposed"]' "criterion"
item t-deferred task deferred 2 null "criterion"
item t-label task open 2 '["proposed"]' "criterion"
item e1 epic open 2
item t-closed task closed 2 null "criterion"
item t-blocker task open 1 null "criterion"
item t-blocked task open 2 null "criterion"
dep t-blocked t-blocker blocks
item t-done-blocker task closed 1 null "criterion"
item t-unblocked task open 2 null "criterion"
dep t-unblocked t-done-blocker blocks
item t-nocrit task open 2
item d1 bug open 2 '["defect"]'
item b-plain bug open 2

run() {
    local code=0
    TRACKER_EXPORT="$EXPORT" bash "$SCRIPT" "$@" > "$work/out" 2>&1 || code=$?
    echo "$code"
}
line() { grep "^$1:" "$work/out" | head -n 1; }

check "an agreed task with a criterion and no blocker passes" "$(run t-ok)" "0"
check "saying ok" "$(line t-ok)" "t-ok: ok"

check "a task whose only blocker is closed passes" "$(run t-unblocked)" "0"

check "a story is refused" "$(run s1)" "1"
check "and sent to refinement, as a story" "$(line s1 | grep -c 'a story.*refinement')" "1"
check "an epic is refused, to refinement" "$(run e1) $(line e1 | grep -c 'refinement')" "1 1"
check "a proposal is refused as one" "$(run t-proposed) $(line t-proposed | grep -c 'proposal.*refinement')" "1 1"
check "an agreed label without the deferral is still a proposal" "$(run t-label) $(line t-label | grep -c 'proposal')" "1 1"
check "a deferred task is refused" "$(run t-deferred) $(line t-deferred | grep -c 'deferred')" "1 1"
check "a closed task is refused" "$(run t-closed) $(line t-closed | grep -c 'closed')" "1 1"
check "a blocked task is refused, naming what blocks it" "$(run t-blocked) $(line t-blocked | grep -c 'blocked by t-blocker')" "1 1"
check "a task with no done criterion is refused, as such" "$(run t-nocrit) $(line t-nocrit | grep -c 'no done criterion')" "1 1"
check "an id the tracker does not have is refused" "$(run t-ghost) $(line t-ghost | grep -c 'not in the tracker')" "1 1"

check "a debt is refused as a debt, its tasks planned at refinement" "$(run d1) $(line d1 | grep -c '^d1: a debt: refinement plans its tasks')" "1 1"
check "and never called a story" "$(line d1 | grep -c story || true)" "0"
check "a bug that is not a debt says to record it as one" "$(run b-plain) $(line b-plain | grep -c 'not a debt')" "1 1"

check "several ids: one line each, and any refusal fails the whole" \
    "$(run t-ok t-nocrit t-unblocked) $(wc -l < "$work/out" | tr -d ' ')" "1 3"

check "no id at all is a usage error, not a pass" "$(run)" "2"

if [ "$failures" -gt 0 ]; then
    echo "planning-check.test: $failures failure(s)"
    exit 1
fi
echo "planning-check.test: only an agreed, unblocked task with a done criterion passes; everything else is refused with its reason."
