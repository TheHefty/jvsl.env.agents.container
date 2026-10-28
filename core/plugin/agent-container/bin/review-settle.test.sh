#!/usr/bin/env bash
# Exercises review-settle, the real script, with bd and gh stubbed.
#
# Accepting is not merging (story the-review): an accepted task closes when its
# pull request is merged, and not before. The failures this guards go both ways
# — a task closed while its change is still open, or one never closed after it
# merged — and the quiet one, a gh that cannot answer being read as "merged".
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=core/plugin/agent-container/bin/daily-fixture.sh
. "$HERE/daily-fixture.sh"
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
export BD_CALLS="$work/calls" GH_STATES="$work/states"
EXPORT="$work/export.jsonl"

item t-merged task in_progress 2 '["accepted"]' "c"; meta t-merged pr 238
item t-open task in_progress 2 '["accepted"]' "c"; meta t-open pr 239
item t-dropped task in_progress 2 '["accepted"]' "c"; meta t-dropped pr 240
item t-nopr task in_progress 2 '["accepted"]' "c"
item t-unaccepted task in_progress 2 null "c"; meta t-unaccepted pr 241
item t-closed task closed 2 '["accepted"]' "c"; meta t-closed pr 242
printf '238 MERGED\n239 OPEN\n240 CLOSED\n241 MERGED\n242 MERGED\n' > "$GH_STATES"

run() {
    local code=0
    : > "$BD_CALLS"
    DAILY_EXPORT="$EXPORT" REVIEW_BD="$work/bin/bd" REVIEW_GH="$work/bin/gh" \
        bash "$HERE/review-settle" "$@" > "$work/out" 2>&1 || code=$?
    echo "$code"
}
line() { grep "^$1:" "$work/out" | head -n 1; }
closed() { grep -c $'^close\t'"$1"$'\t' "$BD_CALLS" || true; }

check "settling everything accepted runs cleanly" "$(run)" "0"
check "an accepted task whose PR merged is closed" "$(closed t-merged)" "1"
check "with the PR in the reason" "$(grep -c $'^close\tt-merged\t--reason\tAccepted in review; merged in #238.$' "$BD_CALLS")" "1"
check "an accepted task whose PR is open stays open" "$(closed t-open)" "0"
check "and says it is waiting" "$(line t-open | grep -c 'waiting for #239')" "1"
check "an accepted task whose PR was closed unmerged stays open" "$(closed t-dropped)" "0"
check "and says the PR was closed without merging" "$(line t-dropped | grep -c '#240 was closed without merging')" "1"
check "an accepted task with no PR recorded stays open" "$(closed t-nopr)" "0"
check "and says how to record it" "$(line t-nopr | grep -c 'set-metadata pr=')" "1"
check "a task nobody accepted is never closed, whatever its PR" "$(closed t-unaccepted)" "0"
check "nor named when settling everything" "$(line t-unaccepted | wc -l | tr -d ' ')" "0"
check "a closed task is left alone" "$(closed t-closed)" "0"
check "exactly one close in all" "$(grep -c '^close' "$BD_CALLS")" "1"

check "naming one task settles only that one" "$(run t-open)" "0"
check "and touches nothing else" "$(wc -l < "$BD_CALLS" | tr -d ' ')" "0"
check "naming an unaccepted task is not an error" "$(run t-unaccepted)" "0"
check "and says it has nothing to settle" "$(line t-unaccepted | grep -c 'not accepted')" "1"

GH_FAIL="To get started with GitHub CLI, please run:  gh auth login" run t-merged > "$work/rc"
check "a gh that cannot answer fails the settle" "$(cat "$work/rc")" "1"
check "and closes nothing" "$(closed t-merged)" "0"
check "naming gh's own error" "$(line t-merged | grep -c 'gh auth login')" "1"

if [ "$failures" -gt 0 ]; then
    echo "review-settle.test: $failures failure(s)"
    exit 1
fi
echo "review-settle.test: an accepted task closes when its PR is merged, and only then; anything else is said."
