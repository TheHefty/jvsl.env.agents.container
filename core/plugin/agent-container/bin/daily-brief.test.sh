#!/usr/bin/env bash
# Exercises daily-brief, the real script, against a fixture `bd export`.
#
# The brief is what the developer chooses the day from, so the failure it
# guards is a wrong picture: a blocked task offered as ready, a finished blocker
# still holding something back, a parent read as a blocker, today's journal
# taken for yesterday's (story the-daily).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/daily-brief"
# shellcheck source=core/plugin/agent-container/bin/daily-fixture.sh
. "$HERE/daily-fixture.sh"

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

brief() { DAILY_EXPORT="$EXPORT" DAILY_TODAY=2026-10-28 bash "$SCRIPT"; }
# The ids listed under one section, in order, space-separated.
section() { brief | awk -v h="## $1" '$0 == h {on = 1; next} /^## / {on = 0} on && /^- / {print $2}' | paste -sd' ' -; }
left_open() { brief | awk '$0 == "## Left open yesterday" {on = 1; next} /^## / {on = 0} on' | sed '/^$/d'; }

item s1 feature open 2 null "Scenario: x"
item t-going task in_progress 2 null "criterion"
item t-low task open 3 null "criterion" 2026-10-01T00:00:00Z
item t-high task open 1 null "criterion" 2026-10-05T00:00:00Z
item t-tie-old task open 2 null "criterion" 2026-10-01T00:00:00Z "" 0
item t-tie-key task open 2 null "criterion" 2026-10-09T00:00:00Z "" 3
item t-proposal task deferred 2 '["proposed"]' "criterion"
# Labelled a proposal but not deferred: half of a proposal is still one.
item t-half-proposal task open 2 '["proposed"]' "criterion"
item t-blocked task open 1 null "criterion"
dep t-blocked t-high blocks
item t-was-blocked task open 2 null "criterion" 2026-10-02T00:00:00Z
item t-closed-blocker task closed 1 null "criterion"
dep t-was-blocked t-closed-blocker blocks
item t-child task open 2 null "criterion" 2026-10-03T00:00:00Z
dep t-child s1 parent-child
item t-done task closed 2 null "criterion"
item t-nocrit task open 2 null "" 2026-10-04T00:00:00Z

check "in progress lists what is being worked on" "$(section 'In progress')" "t-going"
check "a blocked task is never offered as ready" "$(section Ready | tr ' ' '\n' | grep -cx t-blocked || true)" "0"
check "it is listed as blocked" "$(section Blocked)" "t-blocked"
check "naming what blocks it" "$(brief | grep -c '^- t-blocked .*blocked by t-high')" "1"
check "a closed blocker no longer blocks" "$(section Ready | tr ' ' '\n' | grep -cx t-was-blocked)" "1"
check "a parent is not a blocker" "$(section Ready | tr ' ' '\n' | grep -cx t-child)" "1"
check "ready is ordered by priority, then by what each unblocks, then by age" \
    "$(section Ready)" "t-high t-tie-key t-tie-old t-was-blocked t-child t-nocrit t-low"
check "a task with no criterion is offered, marked so the daily asks for one" \
    "$(brief | grep -c '^- t-nocrit .*no done criterion')" "1"
check "proposals, stories and closed tasks are not offered" \
    "$(section Ready | tr ' ' '\n' | grep -cxE 't-proposal|t-half-proposal|s1|t-done' || true)" "0"

check "with no journal yet, the brief says so" "$(left_open)" "No journal entry yet."

item j-old task open 2 '["journal"]' "" 2026-10-26T18:00:00Z "## Discovered
a thing
## Left open
the oldest point"
item j-yesterday task open 2 '["journal"]' "" 2026-10-27T18:00:00Z "## Discovered
the default was wrong
## Left open
- the migration's second half
- ask about the cache
## Decided alone
nothing"
item j-today task open 2 '["journal"]' "" 2026-10-28T09:00:00Z "## Left open
written this morning"
check "yesterday's open points come from the latest entry before today, that section only" \
    "$(left_open | paste -sd'|' -)" "- the migration's second half|- ask about the cache"
check "and journal entries are not tasks to offer" "$(section Ready | tr ' ' '\n' | grep -c '^j-' || true)" "0"

if [ "$failures" -gt 0 ]; then
    echo "daily-brief.test: $failures failure(s)"
    exit 1
fi
echo "daily-brief.test: in progress, blocked with its blockers, ready in order, and yesterday's open points — each from the export as it is."
