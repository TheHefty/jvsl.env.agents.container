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

# The study skill allows its topic's folder instead (story
# the-study-skill-builds-a-topic): the material may be written there, the post
# nowhere.
endwith() { local code=0; (cd "$r" && bash "$HERE/report-guard" end "$@") > "$work/out" 2>&1 || code=$?; echo "$code"; }
fresh; guard start > /dev/null
mkdir -p "$r/docs/study/x"; printf 'g\n' > "$r/docs/study/x/guide.md"; printf 'i\n' > "$r/docs/study/.gitignore"
check "with a folder allowed, writing inside it passes" "$(endwith docs/study/x/ docs/study/.gitignore)" "0"
fresh; guard start > /dev/null
mkdir -p "$r/docs/study/x" "$r/docs/posts"; printf 'g\n' > "$r/docs/study/x/guide.md"; printf 'p\n' > "$r/docs/posts/x.md"
check "a post written beside it fails, named" "$(endwith docs/study/x/) $(grep -c 'appeared: docs/posts/x.md' "$work/out")" "1 1"
fresh; guard start > /dev/null
mkdir -p "$r/docs/study/x"; printf 'g\n' > "$r/docs/study/x/guide.md"; printf 'more\n' >> "$r/README.md"
check "an edited project file fails too" "$(endwith docs/study/x/) $(grep -c 'changed: README.md' "$work/out")" "1 1"
fresh; guard start > /dev/null
mkdir -p "$r/docs/study/x"; printf 'g\n' > "$r/docs/study/x/guide.md"
check "with nothing allowed, only the report may change, as before" "$(guard end) $(grep -c 'appeared: docs/study/x/guide.md' "$work/out")" "1 1"
fresh; guard start > /dev/null
mkdir -p "$r/docs/study/xy"; printf 'g\n' > "$r/docs/study/xy/guide.md"
check "an allowed folder is a folder, not a prefix of another" "$(endwith docs/study/x/) $(grep -c 'docs/study/xy/guide.md' "$work/out")" "1 1"

fresh
check "end without start is refused, not a pass" "$(guard end)" "2"
check "a word other than start or end is a usage error" "$(guard middle)" "2"

if [ "$failures" -gt 0 ]; then
    echo "report-guard.test: $failures failure(s)"
    exit 1
fi
echo "report-guard.test: only docs/REPORT.md may change while the report is written; anything else is named."
