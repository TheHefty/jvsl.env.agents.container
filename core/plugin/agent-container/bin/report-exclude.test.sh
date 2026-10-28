#!/usr/bin/env bash
# Exercises report-exclude, the real script, in a real git repository (story
# the-project-report). The report is a snapshot: kept out of git through
# .git/info/exclude, which is local and unversioned, so writing it changes no
# file of the project — a line in .gitignore would.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=core/plugin/agent-container/bin/report-fixture.sh
. "$HERE/report-fixture.sh"

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
repo "$work/r"; r="$work/r"
exclude="$(git -C "$r" rev-parse --git-path info/exclude)"; case "$exclude" in /*) ;; *) exclude="$r/$exclude" ;; esac

(cd "$r" && bash "$HERE/report-exclude")
mkdir -p "$r/docs"; report > "$r/docs/REPORT.md"
check "the report is ignored" "$(git -C "$r" check-ignore -q docs/REPORT.md && echo ignored || echo tracked)" "ignored"
check "and nothing in the project changed" "$(git -C "$r" status --porcelain | wc -l | tr -d ' ')" "0"
(cd "$r" && bash "$HERE/report-exclude")
check "running it twice adds one line" "$(grep -cx '/docs/REPORT.md' "$exclude")" "1"

printf 'tmp/' > "$exclude"
(cd "$r" && bash "$HERE/report-exclude")
check "an exclude with no final newline keeps its last line whole" "$(grep -cx 'tmp/' "$exclude") $(grep -cx '/docs/REPORT.md' "$exclude")" "1 1"
check "outside a repository it says so" "$( (cd "$work" && bash "$HERE/report-exclude") > /dev/null 2>&1; echo $?)" "1"

if [ "$failures" -gt 0 ]; then
    echo "report-exclude.test: $failures failure(s)"
    exit 1
fi
echo "report-exclude.test: docs/REPORT.md is ignored through the local exclude, once, and the project is left unchanged."
