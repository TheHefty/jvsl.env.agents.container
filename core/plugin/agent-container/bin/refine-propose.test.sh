#!/usr/bin/env bash
# Exercises refine-propose, the real script, with bd stubbed and a fixture export.
#
# A proposal is written whole or not at all (story refinement): both halves of
# a proposal — the label and the deferral — every time, and never a link the
# chain could not use: a task with no done criterion, a story with no scenario,
# a child in the wrong place or under something nobody agreed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=core/plugin/agent-container/bin/tracker-fixture.sh
. "$HERE/tracker-fixture.sh"
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
export BD_CALLS="$work/calls" BD_NEW_ID=n-1
EXPORT="$work/export.jsonl"

item e1 epic open 2
item e-prop epic deferred 2 '["proposed"]'
item s1 feature open 2 null "Scenario: x"
item s-prop feature deferred 2 '["proposed"]' "Scenario: x"
item s-closed feature closed 2 null "Scenario: x"
item t1 task open 2 null "c"
# Debts (task refinement-plans-a-debts-fix-as-tasks-under-it): a bug labelled
# defect, hotfix or shortcut is like a story, and its fix is planned as tasks.
item d1 bug open 2 '["defect"]'
item d-hot bug in_progress 2 '["hotfix"]'
item d-prop bug deferred 2 '["defect","proposed"]'
item d-closed bug closed 2 '["defect"]'
item b-plain bug open 2
printf 'What it is for.\n' > "$work/body"
printf 'Done when the planning lists it.\n' > "$work/crit"
printf 'Feature: f\n  Scenario: it happens\n    Then it is so\n' > "$work/scen"
: > "$work/empty"

run() {
    local code=0
    : > "$BD_CALLS"
    TRACKER_EXPORT="$EXPORT" REVIEW_BD="$work/bin/bd" bash "$HERE/refine-propose" "$@" > "$work/out" 2>&1 || code=$?
    echo "$code"
}
calls() { wc -l < "$BD_CALLS" | tr -d ' '; }
created() { grep $'^create\t' "$BD_CALLS" | head -n 1; }

check "a task under an agreed story, with a criterion, is proposed" "$(run task s1 'the planning' "$work/body" "$work/crit")" "0"
check "as a task under that story" "$(created | grep -c $'\t-t\ttask\t.*--parent\ts1\t')" "1"
check "carrying both halves of a proposal" "$(created | grep -c -- $'--labels\tproposed\t--status\tdeferred')" "1"
check "with its criterion as its acceptance" "$(created | grep -c -- $'--acceptance\tDone when the planning lists it.')" "1"
check "printing its id" "$(tail -n 1 "$work/out")" "n-1"

check "a story under an agreed epic, with a scenario, is proposed" "$(run story e1 'a story' "$work/body" "$work/scen")" "0"
check "as a feature, which is what stories are here" "$(created | grep -c $'\t-t\tfeature\t.*--parent\te1\t')" "1"

check "what a new task waits on is a blocks dependency" "$(run task s1 'second' "$work/body" "$work/crit" t1)" "0"
check "on each id given" "$(grep -c $'^dep\tadd\tn-1\tt1$' "$BD_CALLS")" "1"

refused() {
    local code; code="$(run "$@")"
    echo "$code $(calls)"
}
check "a task with no criterion is refused, writing nothing" "$(refused task s1 t "$work/body" "$work/empty")" "1 0"
check "saying the criterion is what the planning needs" "$(grep -c 'done criterion' "$work/out")" "1"
check "a story with no scenario is refused" "$(refused story e1 s "$work/body" "$work/crit")" "1 0"
check "a task under an epic is refused" "$(refused task e1 t "$work/body" "$work/crit")" "1 0"
check "a story under a story is refused" "$(refused story s1 s "$work/body" "$work/scen")" "1 0"
check "a child under a proposal is refused: it is not agreed yet" "$(refused task s-prop t "$work/body" "$work/crit")" "1 0"
check "a child under a proposed epic too" "$(refused story e-prop s "$work/body" "$work/scen")" "1 0"
check "a child under a closed item is refused" "$(refused task s-closed t "$work/body" "$work/crit")" "1 0"
check "a parent the tracker does not have is refused" "$(refused task s-ghost t "$work/body" "$work/crit")" "1 0"
check "an empty title is refused" "$(refused task s1 '  ' "$work/body" "$work/crit")" "1 0"
check "an empty body is refused" "$(refused task s1 t "$work/empty" "$work/crit")" "1 0"
check "a task under an agreed debt is proposed" "$(run task d1 'fix it' "$work/body" "$work/crit")" "0"
check "as a task under that debt, both halves of a proposal" "$(created | grep -c $'\t-t\ttask\t--parent\td1\t--labels\tproposed\t--status\tdeferred')" "1"
check "a debt in progress takes a task too" "$(run task d-hot 'fix it' "$work/body" "$work/crit")" "0"
check "a bug that is not a debt is refused as a parent" "$(refused task b-plain t "$work/body" "$work/crit")" "1 0"
check "saying it is to be recorded as a debt" "$(grep -c 'not a debt' "$work/out")" "1"
check "a debt that is itself a proposal is refused" "$(refused task d-prop t "$work/body" "$work/crit")" "1 0"
check "a closed debt is refused" "$(refused task d-closed t "$work/body" "$work/crit")" "1 0"
check "a story under a debt is refused: a debt holds tasks" "$(refused story d1 s "$work/body" "$work/scen")" "1 0"
check "an epic is not refinement's to propose" "$(refused epic e1 t "$work/body" "$work/crit")" "2 0"

if [ "$failures" -gt 0 ]; then
    echo "refine-propose.test: $failures failure(s)"
    exit 1
fi
echo "refine-propose.test: a proposal is written whole, in the right place, with what the chain needs — or not at all."
