#!/usr/bin/env bash
# Exercises retro-gather, the real script, against a fixture export and a real
# git repository with commits on chosen days.
#
# What the retro reports from and links to (story the-retro-and-its-journal).
# The failure it guards is the wrong day: yesterday's work in today's entry, or
# a late evening's commits missing from it because the clock was UTC.
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

# Local time is São Paulo, -0300 all year. 2026-10-28T01:30Z is 22:30 on the 27th.
export TZ=America/Sao_Paulo
item t-today task in_progress 2 null c 2026-10-27T13:00:00Z; meta t-today pr 240
item t-late task closed 2 null c 2026-10-28T01:30:00Z
item t-before task open 2 null c 2026-10-26T13:00:00Z
item j-27 chore closed 2 '["journal"]' "" 2026-10-27T23:00:00Z
item t-tomorrow task open 2 null c 2026-10-28T12:00:00Z

repo="$work/repo"; git init -q "$repo"
commit() { GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" git -C "$repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "$2"; }
commit 2026-10-26T15:00:00-0300 "feat: the day before"
commit 2026-10-27T10:00:00-0300 "feat: the morning"
commit 2026-10-27T22:30:00-0300 "fix: late that evening"
commit 2026-10-28T09:00:00-0300 "chore: the next morning"

out="$(cd "$repo" && DAILY_EXPORT="$EXPORT" JOURNAL_TODAY=2026-10-27 bash "$HERE/retro-gather")"
under() { printf '%s\n' "$out" | awk -v h="## $1 on " 'index($0, h) == 1 {on = 1; next} /^## / {on = 0} on && /^- /'; }

check "the items touched that day, by local date" "$(under 'Items touched' | awk '{print $2}' | sort | paste -sd' ' -)" "t-late t-today"
check "with the pull request each one recorded" "$(under 'Items touched' | grep -c '^- t-today .*#240')" "1"
check "the journal itself is not work the retro reports" "$(under 'Items touched' | grep -c j-27 || true)" "0"
check "the commits made that day, by local date, late evening included" \
    "$(under Commits | sed 's/^- [0-9a-f]* //' | paste -sd'|' -)" "fix: late that evening|feat: the morning"

empty="$(cd "$repo" && DAILY_EXPORT="$EXPORT" JOURNAL_TODAY=2026-10-20 bash "$HERE/retro-gather")"
check "a day with nothing says so in both" "$(printf '%s\n' "$empty" | grep -c '^Nothing\.$')" "2"

if [ "$failures" -gt 0 ]; then
    echo "retro-gather.test: $failures failure(s)"
    exit 1
fi
echo "retro-gather.test: the items and the commits of the developer's day, by its local date."
