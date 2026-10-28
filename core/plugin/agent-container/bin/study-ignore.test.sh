#!/usr/bin/env bash
# Exercises study-ignore, the real script, in a real git repository (story
# the-study-material-has-a-contract). What the developer writes while getting
# it wrong does not go into a repository that may be public: attempts.json is
# ignored before the first one is written.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
git init -q "$work/repo"
study="$work/repo/docs/study"
ignored() { git -C "$work/repo" check-ignore -q "$1" && echo ignored || echo tracked; }

bash "$HERE/study-ignore" "$study"
check "a topic's attempts are ignored" "$(ignored docs/study/some-topic/attempts.json)" "ignored"
check "its guide is not" "$(ignored docs/study/some-topic/guide.md)" "tracked"
check "nor its practice" "$(ignored docs/study/some-topic/practice.json)" "tracked"

bash "$HERE/study-ignore" "$study"
check "running it again adds nothing" "$(grep -c 'attempts.json' "$study/.gitignore")" "1"

printf 'notes.txt\n' > "$study/.gitignore"
bash "$HERE/study-ignore" "$study"
check "a .gitignore already there keeps its own lines" "$(grep -cx 'notes.txt' "$study/.gitignore")" "1"
check "and gains the attempts" "$(ignored docs/study/t/attempts.json)" "ignored"

printf 'build/' > "$study/.gitignore"
bash "$HERE/study-ignore" "$study"
check "a .gitignore with no final newline does not glue the line onto its last one" \
    "$(grep -cx 'build/' "$study/.gitignore") $(ignored docs/study/t/attempts.json)" "1 ignored"

check "no folder is a usage error" "$(bash "$HERE/study-ignore" >/dev/null 2>&1; echo $?)" "2"

if [ "$failures" -gt 0 ]; then
    echo "study-ignore.test: $failures failure(s)"
    exit 1
fi
echo "study-ignore.test: attempts.json is ignored in every topic, once, beside whatever the folder already ignores."
