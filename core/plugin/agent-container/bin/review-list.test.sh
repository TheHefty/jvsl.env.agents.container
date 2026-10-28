#!/usr/bin/env bash
# Exercises review-list, the real script, against a fixture `bd export`.
#
# The list is what the review walks: a task it leaves out is a change nobody
# explained, and one it invents is time spent on nothing (story the-review).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

item t-going task in_progress 2 null "the brief lists it"; meta t-going pr 239
item t-waiting task open 2 '["accepted"]' "it closes on merge"; meta t-waiting pr 238
item t-nopr task in_progress 2 null "c"
item t-open task open 2 null "c"
item t-closed task closed 2 '["accepted"]' "c"
item s1 feature in_progress 2
item t-proposal task deferred 2 '["proposed"]' "c"
item j1 task in_progress 2 '["journal"]'

out="$(DAILY_EXPORT="$EXPORT" bash "$HERE/review-list")"
ids() { printf '%s\n' "$out" | sed -n 's/^### \([^ ]*\) .*/\1/p' | paste -sd' ' -; }
block() { printf '%s\n' "$out" | awk -v id="$1" '$1 == "###" {on = ($2 == id); next} on'; }

check "in-progress tasks and accepted open ones are listed" "$(ids)" "t-going t-nopr t-waiting"
check "a task's criterion is shown" "$(block t-going | grep -c '^criterion: the brief lists it$')" "1"
check "and its pull request" "$(block t-going | grep -c '^pr: #239$')" "1"
check "an accepted one says it waits for the merge" "$(block t-waiting | grep -c '^state: accepted, waiting for #238 to merge$')" "1"
check "a missing PR is said, not printed as null" "$(block t-nopr | grep -c '^pr: no pull request recorded$') $(printf '%s' "$out" | grep -c null || true)" "1 0"

if [ "$failures" -gt 0 ]; then
    echo "review-list.test: $failures failure(s)"
    exit 1
fi
echo "review-list.test: what is in progress or accepted is listed with its criterion and its pull request, and nothing else."
