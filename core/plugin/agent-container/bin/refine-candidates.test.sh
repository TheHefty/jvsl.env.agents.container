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

# --- done, rejected, or still being worked (debt ay8) ------------------------------
# What refine-reject really writes when it closes a draft: its own close reason,
# taken from the real script with bd standing in, so the agenda and the script
# cannot drift apart while the fixture stays green.
mkdir -p "$work/bin"
printf '%s\n' '#!/usr/bin/env bash' 'printf "%s\n" "$@" > "$BD_ARGS"' > "$work/bin/bd"; chmod +x "$work/bin/bd"
BD_ARGS="$work/bd-args" REVIEW_BD="$work/bin/bd" bash "$HERE/refine-reject" t-r "not worth it" > /dev/null
rejected="$(sed -n '/^--reason$/{n;p;}' "$work/bd-args")"

item s-verify feature open 2 null "Scenario: x"
item t-v task closed 2 null "c"; dep t-v s-verify parent-child; reason t-v "Merged in #1"
item d-verify bug open 2 '["defect"]'
item t-dv task closed 2 null "c"; dep t-dv d-verify parent-child; reason t-dv "Merged in #2"
item s-more feature open 2 null "Scenario: x"
item t-m1 task closed 2 null "c"; dep t-m1 s-more parent-child; reason t-m1 "Merged in #3"
item t-m2 task open 2 null "c"; dep t-m2 s-more parent-child
item s-rejected feature open 2 null "Scenario: x"
item t-r task closed 2 null "c"; dep t-r s-rejected parent-child; reason t-r "$rejected"

out="$(TRACKER_EXPORT="$EXPORT" bash "$HERE/refine-candidates")"
section() { printf '%s\n' "$out" | awk -v h="## $1" '$0 == h {on = 1; next} /^## / {on = 0} on && /^- / {print $2}' | paste -sd' ' -; }

check "open proposals await agreement, a task proposed under a debt among them" "$(section 'Awaiting agreement')" "p-task t-dp"
check "naming what they are proposed under" "$(printf '%s\n' "$out" | grep -c '^- p-task .*under s-empty')" "1"
check "an agreed story with no agreed task under it is listed, a proposed one or a rejected one not counting" "$(section 'Stories with no agreed task')" "s-empty s-rejected"
check "a task with no criterion is listed for one" "$(section 'Tasks with no done criterion')" "t-old"
check "what tomorrow's planning can pick is shown, a debt's task included" "$(section 'Agreed and ready')" "t-ready t-d t-m2"
check "rejected, closed and journal items appear nowhere" "$(printf '%s\n' "$out" | grep -cE '^- (s-gone|t-gone|j1) ' || true)" "0"

check "an agreed debt with no task is listed for one, a proposed task not counting" "$(section 'Debts with no agreed task')" "d-empty d-proposed-only"
check "a debt with an agreed task, a closed one, and a bug that is not a debt are not" \
    "$(section 'Debts with no agreed task' | tr ' ' '\n' | grep -cxE 'd-planned|d-done|b-plain' || true)" "0"
check "the debt's task is ready for tomorrow's planning" "$(section 'Agreed and ready' | tr ' ' '\n' | grep -cx t-d)" "1"
check "a debt is never listed as a story" "$(section 'Stories with no agreed task' | tr ' ' '\n' | grep -c '^d-' || true)" "0"

check "a story and a debt whose tasks are all done await verification, not a task" "$(section 'Awaiting verification')" "s-verify d-verify"
check "and are not among those that need a task" \
    "$(printf '%s\n' "$(section 'Stories with no agreed task') $(section 'Debts with no agreed task')" | tr ' ' '\n' | grep -cxE 's-verify|d-verify' || true)" "0"
check "a story with more work planned after a done task is in neither list" \
    "$(printf '%s\n' "$out" | grep -c '^- s-more ' || true)" "0"
check "the reason refine-reject writes is read as a rejection" "$(printf '%s' "$rejected" | grep -c '^Rejected in refinement: not worth it$')" "1"

if [ "$failures" -gt 0 ]; then
    echo "refine-candidates.test: $failures failure(s)"
    exit 1
fi
echo "refine-candidates.test: proposals awaiting agreement, stories with no task, tasks with no criterion, and what is ready — nothing rejected."
