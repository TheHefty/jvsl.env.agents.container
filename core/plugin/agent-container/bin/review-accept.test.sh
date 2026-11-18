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

# --- accepted after it was closed (gh-363, task asi.3) ---------------------------
# A task closed past the review and accepted afterwards must not read like one
# accepted before it closed: the tracker's history has to stay true.
check "an open task's acceptance reads as before" "$(run review-accept t1 'fine')" "0"
check "  with no word of a close" "$(grep -c 'after it was closed' "$BD_CALLS" "$work/out" | awk -F: '{s += $2} END {print s}')" "0"
check "  and still points at review-settle" "$(grep -c 'run review-settle t1' "$work/out")" "1"

export TZ=UTC
code="$(BD_SHOW='[{"status":"closed","closed_at":"2026-11-11T15:00:00Z","labels":null}]' run review-accept t1 'it was right')"
check "a closed task can still be accepted" "$code" "0"
check "  labelled accepted" "$(grep -c $'^label\tadd\tt1\taccepted$' "$BD_CALLS")" "1"
check "  with a note that says the acceptance came after the close, and when it closed" \
    "$(grep -c $'^update\tt1\t--append-notes\tAccepted in review on 2026-10-28, after it was closed on 2026-11-11, in the developer\'s words: it was right$' "$BD_CALLS")" "1"
check "  and the output says it was already closed, not that it closes on a merge" \
    "$(grep -c 'was already closed on 2026-11-11' "$work/out") $(grep -c 'review-settle' "$work/out" || true)" "1 0"
code="$(BD_SHOW='[{"status":"closed","closed_at":"2026-11-11T15:00:00.123Z","labels":null}]' run review-accept t1)"
check "an acceptance with no words after the close says so too" \
    "$(grep -c $'^update\tt1\t--append-notes\tAccepted in review on 2026-10-28, after it was closed on 2026-11-11, on the developer\'s word\.$' "$BD_CALLS")" "1"

# The note's truth depends on reading the task, so a tracker that cannot answer
# is refused, never guessed at.
cat > "$work/bin/bd-fail" <<'SH'
#!/usr/bin/env bash
(IFS=$'\t'; echo "$*") >> "$BD_CALLS"
[ "$1" = show ] && { echo "Error: database is locked" >&2; exit 1; }
exit 0
SH
chmod +x "$work/bin/bd-fail"
: > "$BD_CALLS"; code=0
REVIEW_BD="$work/bin/bd-fail" REVIEW_TODAY=2026-10-28 bash "$HERE/review-accept" t1 > "$work/out" 2>&1 || code=$?
check "a task that cannot be read is not accepted" "$code $(grep -c '^label\|^update' "$BD_CALLS" || true)" "1 0"
check "  saying why, in bd's words" "$(grep -c 'database is locked' "$work/out")" "1"

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
