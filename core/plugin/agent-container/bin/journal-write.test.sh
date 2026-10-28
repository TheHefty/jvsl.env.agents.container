#!/usr/bin/env bash
# Exercises journal-write, the real script, with bd stubbed and a fixture export.
#
# One entry per working day (story the-retro-and-its-journal). The failures it
# guards: two entries for one day, or a late retro landing on tomorrow; and an
# entry written without what only the developer can give — their own line —
# or without the decisions the agent took alone.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=core/plugin/agent-container/bin/tracker-fixture.sh
. "$HERE/tracker-fixture.sh"
# shellcheck source=core/plugin/agent-container/bin/review-stubs.sh
. "$HERE/review-stubs.sh"
# shellcheck source=core/plugin/agent-container/bin/journal-body-fixture.sh
. "$HERE/journal-body-fixture.sh"

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
EXPORT="$work/export.jsonl"; : > "$EXPORT"

write() {
    local code=0
    : > "$BD_CALLS"
    TRACKER_EXPORT="$EXPORT" REVIEW_BD="$work/bin/bd" JOURNAL_TODAY="${DAY:-2026-10-28}" \
        bash "$HERE/journal-write" "$work/body.md" > "$work/out" 2>&1 || code=$?
    echo "$code"
}
calls() { wc -l < "$BD_CALLS" | tr -d ' '; }
called() { grep -c "$1" "$BD_CALLS" || true; }

# --- one entry per day ---------------------------------------------------------------

body > "$work/body.md"
check "a first retro writes the day's entry" "$(write)" "0"
check "creating a chore labelled journal, titled for the day" \
    "$(called $'^create\tJournal 2026-10-28\t-t\tchore\t--labels\tjournal\t')" "1"
check "keyed by its day in metadata" "$(called '"day":"2026-10-28"')" "1"
check "and closed, so no planning offers it as work" "$(called $'^close\tj-new\t--reason\t')" "1"
check "it prints the entry's id" "$(tail -n 1 "$work/out")" "j-new"

item j-28 chore closed 2 '["journal"]' "" 2026-10-28T12:00:00Z "old body"; meta j-28 day '"2026-10-28"'
check "a second retro on the same day" "$(write)" "0"
check "updates that day's entry" "$(called $'^update\tj-28\t--body-file\t')" "1"
check "and creates nothing" "$(called '^create')" "0"

DAY=2026-10-29 write > /dev/null
check "a new day gets a new entry, even with yesterday's there" "$(called $'^create\tJournal 2026-10-29\t')" "1"

# 01:00 UTC on the 28th is 22:00 on the 27th in São Paulo: the retro was held on
# the 27th, and that is the day it belongs to.
: > "$EXPORT"
code=0; : > "$BD_CALLS"
TZ=America/Sao_Paulo TRACKER_EXPORT="$EXPORT" REVIEW_BD="$work/bin/bd" JOURNAL_NOW=1793149200 \
    bash "$HERE/journal-write" "$work/body.md" > "$work/out" 2>&1 || code=$?
check "a retro at 22:00 in São Paulo is that day's, not tomorrow's in UTC" "$code $(called $'^create\tJournal 2026-10-27\t')" "0 1"

# --- what only the developer gives ------------------------------------------------------

: > "$EXPORT"
body "" > "$work/body.md"
check "an empty What I learned is refused" "$(write)" "1"
check "nothing is written" "$(calls)" "0"
check "saying the line is the developer's" "$(grep -c "developer's own" "$work/out")" "1"

body "   " > "$work/body.md"
check "a blank What I learned is refused" "$(write) $(calls)" "1 0"

body "x" "" > "$work/body.md"
check "an empty Decided alone is refused, and says Nothing. is the answer when there is nothing" \
    "$(write) $(calls) $(grep -c 'Nothing\.' "$work/out")" "1 0 1"

body | sed '/^## Went wrong$/,/^## Decided alone$/{/^## Decided alone$/!d}' > "$work/body.md"
check "a missing section is refused, naming it" "$(write) $(calls) $(grep -c 'Went wrong' "$work/out")" "1 0 1"

body | awk '/^## Surprised$/ {hold = 1} hold && /^## Went wrong$/ {print; print "x"; print "## Surprised"; print "y"; hold = 0; skip = 1; next} hold {next} skip && /^x$|^y$/ {next} {print}' > "$work/body.md"
check "sections out of order are refused" "$(write) $(calls)" "1 0"

# --- the blog mark follows the body -----------------------------------------------------

item j-28 chore closed 2 '["journal"]' "" 2026-10-28T12:00:00Z "old"; meta j-28 day '"2026-10-28"'
body "x" "Nothing." yes > "$work/body.md"
write > /dev/null
check "a discovery marked as a blog candidate labels the entry" "$(called $'^label\tadd\tj-28\tblog-candidate$')" "1"
body "x" "Nothing." no > "$work/body.md"
write > /dev/null
check "and the label goes when no discovery is marked any more" "$(called $'^label\tremove\tj-28\tblog-candidate$')" "1"

if [ "$failures" -gt 0 ]; then
    echo "journal-write.test: $failures failure(s)"
    exit 1
fi
echo "journal-write.test: one entry per local day, never without the developer's line or the agent's own decisions."
