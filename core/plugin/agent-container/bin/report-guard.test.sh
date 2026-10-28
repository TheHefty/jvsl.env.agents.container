#!/usr/bin/env bash
# Exercises report-guard, the real script, in a real git repository (story
# the-project-report). Writing the report must change nothing but the report:
# the guard compares the tree before and after — not against HEAD, because the
# developer's uncommitted work is already there and is not the report's.
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
guard() { local code=0; (cd "$r" && bash "$HERE/report-guard" "$1") > "$work/out" 2>&1 || code=$?; echo "$code"; }
fresh() { rm -rf "$work/r"; repo "$work/r"; r="$work/r"; }

fresh
check "start records the tree" "$(guard start)" "0"
mkdir -p "$r/docs"; report > "$r/docs/REPORT.md"
check "writing only docs/REPORT.md passes" "$(guard end)" "0"

fresh
printf 'work in progress\n' >> "$r/README.md"; printf 'draft\n' > "$r/notes.txt"
guard start > /dev/null
report > "$r/docs/REPORT.md"
check "uncommitted work already there is not the report's doing" "$(guard end)" "0"

fresh; guard start > /dev/null
printf 'export const port = 9090\n' > "$r/src/app.js"
check "an edited tracked file fails" "$(guard end) $(grep -c 'changed: src/app.js' "$work/out")" "1 1"

fresh; guard start > /dev/null
printf 'x\n' > "$r/build.log"
check "a new file fails" "$(guard end) $(grep -c 'appeared: build.log' "$work/out")" "1 1"

fresh; guard start > /dev/null
rm "$r/README.md"
check "a deleted file fails" "$(guard end) $(grep -c 'disappeared: README.md' "$work/out")" "1 1"

fresh; guard start > /dev/null
chmod +x "$r/src/app.js"
check "a changed mode fails" "$(guard end) $(grep -c 'changed: src/app.js' "$work/out")" "1 1"

fresh
check "end without start is refused, not a pass" "$(guard end)" "2"
check "a word other than start or end is a usage error" "$(guard middle)" "2"

if [ "$failures" -gt 0 ]; then
    echo "report-guard.test: $failures failure(s)"
    exit 1
fi
echo "report-guard.test: only docs/REPORT.md may change while the report is written; anything else is named."
