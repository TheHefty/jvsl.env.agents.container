#!/usr/bin/env bash
# Exercises review-settle and review-list together, the way a review runs them,
# with bd and gh stubbed. Debt a-task-can-be-closed-without-the-reviews-
# acceptance (gh-363), task asi.4.
#
# On 2026-11-11 twelve tasks were closed past the review, and review-settle
# then reported nothing to close, which read as "nothing pending". The bd
# wrapper (asi.1) now refuses such a close, but not the real binary called by
# its path, nor a tracker edited elsewhere. So the review names what closed
# past it since the last review: a task closed without accepted, dropped, a
# rejected proposal or a study topic. The window is kept in the tracker's
# key-value store: review-settle, which a review runs first, reads it and moves
# it; review-list, run after, reads the same window.
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
export BD_CALLS="$work/calls" GH_STATES="$work/states" BD_KV="$work/kv"
: > "$GH_STATES"
EXPORT="$work/export.jsonl"

closed_at() { # closed_at id iso — when bd closed it
    local tmp; tmp="$(mktemp)"
    jq -c --arg id "$1" --arg t "$2" 'if .id == $id then .closed_at = $t else . end' "$EXPORT" > "$tmp" && mv "$tmp" "$EXPORT"
}
settle() { : > "$BD_CALLS"; TRACKER_EXPORT="$EXPORT" REVIEW_BD="$work/bin/bd" REVIEW_GH="$work/bin/gh" REVIEW_NOW="$1" bash "$HERE/review-settle" > "$work/settle" 2>&1; echo $?; }
list() { TRACKER_EXPORT="$EXPORT" REVIEW_BD="$work/bin/bd" bash "$HERE/review-list" > "$work/list" 2>&1; echo $?; }
past() { awk '$0 == "## Closed without the review" {on = 1; next} /^## / {on = 0} on' "$1" | sed '/^$/d'; }
ids() { past "$1" | sed -n 's/^- \([^ ]*\) .*/\1/p' | paste -sd' ' -; }

item t-bypassed task closed 2 null "c"; closed_at t-bypassed 2026-11-11T15:00:00Z
item t-old task closed 2 null "c"; closed_at t-old 2026-10-01T15:00:00Z

# --- the first review: no earlier one is recorded --------------------------------
check "the first review settles" "$(settle 2026-11-10T22:00:00Z)" "0"
check "and says the window starts now, instead of listing every task ever closed" \
    "$(past "$work/settle" | grep -c 'No earlier review is recorded') $(ids "$work/settle")" "1 "
check "it records when it ran" "$(cat "$BD_KV/review.last")" "2026-11-10T22:00:00Z"

# --- closed past it, then the next review ----------------------------------------
item t-accepted task closed 2 '["accepted"]' "c"; closed_at t-accepted 2026-11-11T16:00:00Z
item t-dropped task closed 2 '["dropped"]' "c"; closed_at t-dropped 2026-11-11T16:00:00Z
item t-rejected task closed 2 '["proposed"]' "c"; closed_at t-rejected 2026-11-11T16:00:00Z
item t-study task closed 2 '["study"]' "c"; closed_at t-study 2026-11-11T16:00:00Z
item d-debt bug closed 2 '["defect"]'; closed_at d-debt 2026-11-11T16:00:00Z
item t-frac task closed 2 null "c"; closed_at t-frac 2026-11-11T17:00:00.123456Z

check "the next review settles" "$(settle 2026-11-11T22:00:00Z)" "0"
check "and names each task closed past it since the last review, and only those" \
    "$(ids "$work/settle")" "t-bypassed t-frac"
check "  saying what each one lacks" "$(past "$work/settle" | grep -c '^- t-bypassed .*closed .* without the review')" "1"
check "  and what to do about it" "$(past "$work/settle" | grep -c 'review-accept')" "1"
check "the list the review walks next names the same ones" "$(list) $(ids "$work/list")" "0 t-bypassed t-frac"
check "the window moved" "$(cat "$BD_KV/review.since") $(cat "$BD_KV/review.last")" "2026-11-10T22:00:00Z 2026-11-11T22:00:00Z"

# --- a review after that does not repeat them ---------------------------------------
check "a third review" "$(settle 2026-11-12T22:00:00Z)" "0"
check "repeats nothing closed before the previous one, and says none" \
    "$(ids "$work/settle") $(past "$work/settle" | grep -c '^None\.$')" " 1"
check "and neither does the list" "$(list) $(past "$work/list" | grep -c '^None\.$')" "0 1"

# --- settling named tasks is not a review --------------------------------------------
before="$(cat "$BD_KV/review.last")"
: > "$BD_CALLS"
TRACKER_EXPORT="$EXPORT" REVIEW_BD="$work/bin/bd" REVIEW_GH="$work/bin/gh" REVIEW_NOW=2026-11-13T10:00:00Z \
    bash "$HERE/review-settle" t-accepted > /dev/null 2>&1 || true
check "settling one task moves no window" "$(cat "$BD_KV/review.last") $(grep -c '^kv' "$BD_CALLS" || true)" "$before 0"

# --- the window cannot be recorded -----------------------------------------------------
code="$(BD_KV_FAIL='database is locked' settle 2026-11-14T22:00:00Z)"
check "a window that cannot be recorded fails the settle" "$code" "1"
check "  saying the next review would repeat what this one showed, and bd's words" \
    "$(grep -c 'database is locked' "$work/settle") $(grep -c 'next review' "$work/settle")" "1 1"

if [ "$failures" -gt 0 ]; then
    echo "review-bypass.test: $failures failure(s)"
    exit 1
fi
echo "review-bypass.test: the review names each task closed past it since the last one, once, and keeps the window in the tracker."
