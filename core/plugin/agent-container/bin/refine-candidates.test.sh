#!/usr/bin/env bash
# Exercises refine-candidates, the real script, against a fixture export.
#
# Refinement's agenda (story refinement): what waits for the developer's word,
# what cannot reach a planning yet, and what tomorrow's planning can pick. A rejected
# draft listed again is the same conversation twice.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

item e1 epic open 2
item s-empty feature open 2 null "Scenario: x"
dep s-empty e1 parent-child
item s-done feature open 2 null "Scenario: x"
item t-ready task open 2 null "c"
dep t-ready s-done parent-child
item t-old task open 2
dep t-old s-done parent-child
item p-task task deferred 2 '["proposed"]' "c"
dep p-task s-empty parent-child
item s-gone feature closed 2 '["proposed"]' "Scenario: x"
item t-gone task closed 2 null "c"
item j1 chore closed 2 '["journal"]'
item d-empty bug open 2 '["defect"]'
item d-planned bug open 2 '["shortcut"]'
item t-d task open 2 null "c"
dep t-d d-planned parent-child
item d-proposed-only bug open 2 '["hotfix"]'
item t-dp task deferred 2 '["proposed"]' "c"
dep t-dp d-proposed-only parent-child
item d-done bug closed 2 '["defect"]'
item b-plain bug open 2

out="$(TRACKER_EXPORT="$EXPORT" bash "$HERE/refine-candidates")"
section() { printf '%s\n' "$out" | awk -v h="## $1" '$0 == h {on = 1; next} /^## / {on = 0} on && /^- / {print $2}' | paste -sd' ' -; }

check "open proposals await agreement, a task proposed under a debt among them" "$(section 'Awaiting agreement')" "p-task t-dp"
check "naming what they are proposed under" "$(printf '%s\n' "$out" | grep -c '^- p-task .*under s-empty')" "1"
check "an agreed story with no agreed task under it is listed, a proposed one not counting" "$(section 'Stories with no agreed task')" "s-empty"
check "a task with no criterion is listed for one" "$(section 'Tasks with no done criterion')" "t-old"
check "what tomorrow's planning can pick is shown, a debt's task included" "$(section 'Agreed and ready')" "t-ready t-d"
check "rejected, closed and journal items appear nowhere" "$(printf '%s\n' "$out" | grep -cE '^- (s-gone|t-gone|j1) ' || true)" "0"

check "an agreed debt with no task is listed for one, a proposed task not counting" "$(section 'Debts with no agreed task')" "d-empty d-proposed-only"
check "a debt with an agreed task, a closed one, and a bug that is not a debt are not" \
    "$(section 'Debts with no agreed task' | tr ' ' '\n' | grep -cxE 'd-planned|d-done|b-plain' || true)" "0"
check "the debt's task is ready for tomorrow's planning" "$(section 'Agreed and ready' | tr ' ' '\n' | grep -cx t-d)" "1"
check "a debt is never listed as a story" "$(section 'Stories with no agreed task' | tr ' ' '\n' | grep -c '^d-' || true)" "0"

if [ "$failures" -gt 0 ]; then
    echo "refine-candidates.test: $failures failure(s)"
    exit 1
fi
echo "refine-candidates.test: proposals awaiting agreement, stories with no task, tasks with no criterion, and what is ready — nothing rejected."
