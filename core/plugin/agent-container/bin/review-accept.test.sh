#!/usr/bin/env bash
# Exercises review-accept and review-reopen, the real scripts, with bd stubbed.
#
# What a review still holds before accepting (task the-review-accepts-on-the-
# developers-word, from the developer's request at gh-314): what changed is
# shown against the done criterion, and acceptance is the developer's word —
# no explanation is demanded. A comment they give is kept verbatim.
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

check "an acceptance with no task id is a usage error" "$(run review-accept)" "2"

for words in '' '   ' $'\t\n'; do
    check "an acceptance with no words ($(printf %q "$words")) passes" "$(run review-accept t1 "$words")" "0"
    check "on the developer's word, said so" "$(grep -c $'^update\tt1\t--append-notes\tAccepted in review on 2026-10-28, on the developer\'s word.$' "$BD_CALLS")" "1"
done

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
echo "review-accept.test: acceptance happens on the developer's word, with any comment they gave kept as written; a reopen still needs its reason."
