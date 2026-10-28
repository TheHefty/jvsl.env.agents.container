#!/usr/bin/env bash
# Exercises study-move, the real script, with bd stubbed, a fixture export and
# real topic files (story the-view-moves-the-topic-in-the-tracker).
#
# The one way the Study view writes to the tracker, so the rules are here and
# not in a page: a topic is not ready until every item has an attempt in the
# files themselves, not published until it was ready and has a link, and no
# move ever undoes progress or touches an item that is not a study topic.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE="$HERE/../study/example/bd-labels-are-null"
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
export BD_CALLS="$work/calls"
EXPORT="$work/export.jsonl"
root="$work/ws"; topic="$root/docs/study/bd-labels-are-null"; mkdir -p "$topic"; cp "$EXAMPLE"/* "$topic/"
ids="$(jq -r '.items[].id' "$topic/practice.json")"

tracked() { : > "$EXPORT"; item st-1 task "$1" 2 "$2" "c"; meta st-1 study '"bd-labels-are-null"'; }
attempt_all() { jq -n --args '$ARGS.positional | map({(.): [{at: "2026-10-28T21:00:00-03:00", text: "x"}]}) | add' $ids > "$topic/attempts.json"; }
attempt_some() { printf '{"ex-1": [{"at": "2026-10-28T21:00:00-03:00", "text": "x"}]}' > "$topic/attempts.json"; }
move() {
    local code=0
    : > "$BD_CALLS"
    STUDY_ROOT="$root" TRACKER_EXPORT="$EXPORT" REVIEW_BD="$work/bin/bd" bash "$HERE/study-move" "$@" > "$work/out" 2>&1 || code=$?
    echo "$code"
}
calls() { wc -l < "$BD_CALLS" | tr -d ' '; }
has() { grep -c -- "$1" "$BD_CALLS" || true; }

# --- started --------------------------------------------------------------------
tracked open '["study"]'
check "an open topic is started" "$(move bd-labels-are-null started) $(has $'^update\tst-1\t--status\tin_progress$')" "0 1"
for state in 'in_progress|["study"]' 'in_progress|["study","ready-to-write"]' 'closed|["study","ready-to-write"]'; do
    tracked "${state%%|*}" "${state#*|}"
    check "started on a topic already ${state} changes nothing" "$(move bd-labels-are-null started) $(calls)" "0 0"
done

# --- ready ----------------------------------------------------------------------
tracked in_progress '["study"]'; rm -f "$topic/attempts.json"
check "ready with no attempt at all is refused, writing nothing" "$(move bd-labels-are-null ready) $(calls)" "1 0"
attempt_some
check "ready with items left is refused, writing nothing" "$(move bd-labels-are-null ready) $(calls)" "1 0"
check "naming every item still without an attempt" "$(grep -o 'q-[0-9]\|ex-2' "$work/out" | sort -u | paste -sd' ' -)" "ex-2 q-1 q-2 q-3 q-4 q-5"
printf '{"ex-1": [], "ex-2": [{"at": "2026-10-28T21:00:00-03:00", "text": "x"}]}' > "$topic/attempts.json"
check "an empty list of attempts is no attempt" "$(move bd-labels-are-null ready; grep -c 'ex-1' "$work/out")" $'1\n1'
attempt_all
check "every item attempted: ready" "$(move bd-labels-are-null ready) $(has $'^label\tadd\tst-1\tready-to-write$')" "0 1"
check "and its status is left in progress" "$(has $'\t--status\t')" "0"
tracked open '["study"]'
check "ready on a topic never started also starts it" "$(move bd-labels-are-null ready) $(has $'^update\tst-1\t--status\tin_progress$')" "0 1"
tracked in_progress '["study","ready-to-write"]'
check "ready on a topic already ready adds nothing" "$(move bd-labels-are-null ready) $(calls)" "0 0"
tracked closed '["study","ready-to-write"]'
check "ready on a published topic is refused" "$(move bd-labels-are-null ready) $(calls)" "1 0"

# --- published --------------------------------------------------------------------
tracked in_progress '["study"]'
check "published before ready is refused" "$(move bd-labels-are-null published https://blog.example/post) $(calls)" "1 0"
tracked in_progress '["study","ready-to-write"]'
check "published with no link is refused" "$(move bd-labels-are-null published) $(calls)" "1 0"
check "published with a link that is not http(s) is refused" "$(move bd-labels-are-null published 'javascript:alert(1)') $(calls)" "1 0"
check "published with a link closes it, the link as the reason" \
    "$(move bd-labels-are-null published https://blog.example/post) $(has $'^close\tst-1\t--reason\tPublished: https://blog.example/post$')" "0 1"
tracked closed '["study","ready-to-write"]'
check "a topic already published is refused, not closed again" "$(move bd-labels-are-null published https://blog.example/other) $(calls)" "1 0"

# --- only study topics ----------------------------------------------------------------
: > "$EXPORT"; item x-1 task open 2 null "c"; meta x-1 study '"bd-labels-are-null"'
check "an item with the metadata but not the study label is never moved" "$(move bd-labels-are-null started) $(calls)" "1 0"
: > "$EXPORT"
check "a topic with no task says how to track it" "$(move bd-labels-are-null started) $(grep -c 'study-track' "$work/out")" "1 1"
check "a move the script does not know is a usage error" "$(move bd-labels-are-null archived)" "2"

if [ "$failures" -gt 0 ]; then
    echo "study-move.test: $failures failure(s)"
    exit 1
fi
echo "study-move.test: three moves, each refused unless it was earned, none undoing progress, none touching anything but a study topic."
