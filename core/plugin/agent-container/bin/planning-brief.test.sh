#!/usr/bin/env bash
# Exercises planning-brief, the real script, against a fixture `bd export`.
#
# The brief is what the developer chooses the day from, so the failure it
# guards is a wrong picture: a blocked task offered as ready, a finished blocker
# still holding something back, a parent read as a blocker, today's journal
# taken for yesterday's (story the-planning).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/planning-brief"
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

brief() { TRACKER_EXPORT="$EXPORT" PLANNING_TODAY=2026-10-28 bash "$SCRIPT"; }
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
check "a task with no criterion is offered, marked so the planning asks for one" \
    "$(brief | grep -c '^- t-nocrit .*no done criterion')" "1"
check "proposals, stories and closed tasks are not offered" \
    "$(section Ready | tr ' ' '\n' | grep -cxE 't-proposal|t-half-proposal|s1|t-done' || true)" "0"

# The brief's day is the local one (PLANNING_TODAY pins it), and so are the days
# the work happened on: every fixture item above was touched in early October.
check "with no journal yet, the brief says so" "$(left_open | grep -c '^No journal entry yet\.$')" "1"
check "and a day with work and no entry is said to have skipped its retro" \
    "$(left_open | grep -c '^No journal for 2026-10-09, which had work: its retro was skipped\.$')" "1"

# --- entries in the shape journal-write accepts (story the-retro-and-its-journal) ---
# shellcheck source=core/plugin/agent-container/bin/journal-body-fixture.sh
. "$HERE/journal-body-fixture.sh"
# Found by their `day`, not by when they were created: j-late was written at
# 01:00 UTC on the 28th, which is the 27th's retro held late at -0300.
item j-old chore closed 2 '["journal"]' "" 2026-10-26T18:00:00Z "$(body x Nothing. no '- the oldest point')"
meta j-old day '"2026-10-26"'
item j-late chore closed 2 '["journal"]' "" 2026-10-28T01:00:00Z "$(body x Nothing. no '- the second half of the migration
- ask about the cache')"
meta j-late day '"2026-10-27"'
item j-today chore closed 2 '["journal"]' "" 2026-10-28T09:00:00Z "$(body x Nothing. no '- written this morning')"
meta j-today day '"2026-10-28"'
check "yesterday's open points come from the entry for the latest day before today, that section only" \
    "$(left_open | grep -v '^No journal' | paste -sd'|' -)" "- the second half of the migration|- ask about the cache"
check "and journal entries are not tasks to offer" "$(section Ready | tr ' ' '\n' | grep -c '^j-' || true)" "0"

# Touched on the 27th, and the 27th has its entry: nothing was skipped.
item t-27 task open 2 null "c" 2026-10-27T15:00:00Z
check "a day with work and its entry is not called skipped" "$(left_open | grep -c 'skipped' || true)" "0"
# Touched on the 27th, local, but the only entry is the 26th's: skipped.
grep -v '"id":"j-late"' "$EXPORT" > "$work/e2"; mv "$work/e2" "$EXPORT"
check "a day with work and no entry is called skipped, by its local date" \
    "$(left_open | grep -c '^No journal for 2026-10-27, which had work: its retro was skipped\.$')" "1"

if [ "$failures" -gt 0 ]; then
    echo "planning-brief.test: $failures failure(s)"
    exit 1
fi
echo "planning-brief.test: in progress, blocked with its blockers, ready in order, and yesterday's open points — each from the export as it is."
