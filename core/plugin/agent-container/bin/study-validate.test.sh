#!/usr/bin/env bash
# Exercises study-validate, the real script, the way the study skill runs it
# (story the-study-material-has-a-contract). Since 2026-10-28 a topic is its
# guide alone. The command's contract: silent and 0 on a valid topic, one
# `file: path: message` line per problem and 1 otherwise — never skipped.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE="$HERE/../study/example/bd-labels-are-null"

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
run() { local code=0; bash "$HERE/study-validate" "$@" > "$work/out" 2>&1 || code=$?; echo "$code"; }

check "the example topic is valid" "$(run "$EXAMPLE")" "0"
check "and says nothing" "$(wc -c < "$work/out" | tr -d ' ')" "0"

cp -r "$EXAMPLE" "$work/bd-labels-are-null"
sed -i '/^## Sources$/d' "$work/bd-labels-are-null/guide.md"
check "a broken guide fails" "$(run "$work/bd-labels-are-null")" "1"
check "naming the file and what is wrong" "$(grep -c '^guide.md: .*Sources' "$work/out")" "1"

check "several topics are checked in one call, failing if any fails" "$(run "$EXAMPLE" "$work/bd-labels-are-null")" "1"
check "each problem once, named by its topic's folder" "$(grep -c . "$work/out") $(grep -c '^guide.md' "$work/out")" "2 1"
check "a folder that is not a topic is reported, not skipped" "$(run "$work/nowhere") $(grep -c 'guide.md: .*missing' "$work/out")" "1 1"
check "no folder at all is a usage error" "$(run)" "2"

if [ "$failures" -gt 0 ]; then
    echo "study-validate.test: $failures failure(s)"
    exit 1
fi
echo "study-validate.test: a valid guide passes in silence; anything else is one line per problem, never skipped."
