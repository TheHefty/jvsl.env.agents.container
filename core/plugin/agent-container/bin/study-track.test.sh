#!/usr/bin/env bash
# Exercises study-track, the real script, with bd stubbed and a fixture export
# (story the-study-skill-builds-a-topic). One task per topic, found by its
# metadata rather than its title, and a rebuild that never touches its status:
# the developer's progress is theirs, and a published topic stays published.
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
export BD_CALLS="$work/calls" BD_NEW_ID=st-1
EXPORT="$work/export.jsonl"; : > "$EXPORT"

run() {
    local code=0
    : > "$BD_CALLS"
    TRACKER_EXPORT="$EXPORT" REVIEW_BD="$work/bin/bd" bash "$HERE/study-track" "$@" > "$work/out" 2>&1 || code=$?
    echo "$code"
}
has() { grep -c -- "$1" "$BD_CALLS" || true; }

check "a first build tracks the topic" "$(run bd-labels-are-null 'bd prints labels as null')" "0"
check "as one task labelled study" "$(has $'^create\tbd prints labels as null\t-t\ttask\t--labels\tstudy\t')" "1"
check "keyed by its slug, and pointing at its folder" "$(has '"study":"bd-labels-are-null","folder":"docs/study/bd-labels-are-null"')" "1"
check "with its done criterion" "$(has 'every practice item has an attempt')" "1"
check "left not studied: nothing claims or closes it" "$(has '^close\|--claim\|--status')" "0"
check "printing its id" "$(tail -n 1 "$work/out")" "st-1"

item st-1 task in_progress 2 '["study"]' "c"; meta st-1 study '"bd-labels-are-null"'
check "a rebuild of a topic in progress" "$(run bd-labels-are-null 'bd prints labels as null, again')" "0"
check "updates that task" "$(has $'^update\tst-1\t--title\tbd prints labels as null, again')" "1"
check "creates nothing" "$(has '^create')" "0"
check "and leaves its status alone" "$(has $'\t--status\|^close\|^reopen\|\t--claim\|^undefer')" "0"

: > "$EXPORT"; item st-2 task closed 2 '["study"]' "c"; meta st-2 study '"published-one"'
check "a rebuild of a published topic" "$(run published-one 'Published one') $(has '^create') $(has $'\t--status\|^reopen')" "0 0 0"

: > "$EXPORT"; item st-3 task open 2 '["study"]' "c"; meta st-3 study '"renamed"'
sed -i 's/"title":"title of st-3"/"title":"a title someone edited"/' "$EXPORT"
check "the task is found by its slug, not its title" "$(run renamed 'Renamed') $(has $'^update\tst-3\t')" "0 1"

check "a slug the contract would refuse is refused" "$(run 'Not A Slug' t) $(wc -l < "$BD_CALLS" | tr -d ' ')" "2 0"

if [ "$failures" -gt 0 ]; then
    echo "study-track.test: $failures failure(s)"
    exit 1
fi
echo "study-track.test: one task per topic, found by its slug, and a rebuild never changes its status."
