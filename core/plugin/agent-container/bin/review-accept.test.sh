#!/usr/bin/env bash
# Exercises review-accept and review-reopen, the real scripts, with bd stubbed.
#
# The failure they exist against is a task accepted, or sent back, without the
# developer saying anything: the epic's point is that a change is done when the
# developer can explain it, and the one part of that a script can hold is that
# the explanation exists (story the-review).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

run() {
    local script="$1" code=0; shift
    : > "$BD_CALLS"
    REVIEW_BD="$work/bin/bd" REVIEW_TODAY=2026-10-28 bash "$HERE/$script" "$@" > "$work/out" 2>&1 || code=$?
    echo "$code"
}
calls() { wc -l < "$BD_CALLS" | tr -d ' '; }

for words in '' '   ' $'\t\n'; do
    check "an acceptance with no words ($(printf %q "$words")) is refused" "$(run review-accept t1 "$words")" "1"
    check "and nothing is written to the tracker" "$(calls)" "0"
done
check "the refusal says what acceptance needs" "$(grep -c "own words" "$work/out")" "1"
check "an acceptance with no task id is a usage error" "$(run review-accept)" "2"

check "an acceptance in the developer's words is recorded" \
    "$(run review-accept t1 'It reads the PR state, and only MERGED closes; "open" waits.')" "0"
check "the task is labelled accepted" "$(grep -c $'^label\tadd\tt1\taccepted$' "$BD_CALLS")" "1"
check "and the words are kept verbatim in its notes" \
    "$(grep -c $'^update\tt1\t--append-notes\tAccepted in review on 2026-10-28, in the developer\'s words: It reads the PR state, and only MERGED closes; "open" waits.$' "$BD_CALLS")" "1"
check "accepting does not close it: merging does" "$(grep -c '^close' "$BD_CALLS" || true)" "0"

for why in '' '  '; do
    check "a reopen with no reason ($(printf %q "$why")) is refused" "$(run review-reopen t1 "$why")" "1"
    check "and nothing is written" "$(calls)" "0"
done
check "a reopen with a reason is recorded" "$(run review-reopen t1 'the closed-unmerged case has no test')" "0"
check "its acceptance, if any, is taken back" "$(grep -c $'^label\tremove\tt1\taccepted$' "$BD_CALLS")" "1"
check "and what is missing is in its notes" \
    "$(grep -c $'^update\tt1\t--append-notes\tReopened in review on 2026-10-28: the closed-unmerged case has no test$' "$BD_CALLS")" "1"
check "and it is not closed" "$(grep -c '^close' "$BD_CALLS" || true)" "0"

if [ "$failures" -gt 0 ]; then
    echo "review-accept.test: $failures failure(s)"
    exit 1
fi
echo "review-accept.test: nothing is accepted or reopened without words, and the words are kept as written."
