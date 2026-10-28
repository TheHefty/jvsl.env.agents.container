#!/usr/bin/env bash
# Exercises study-validate, the real script, the way the study skill runs it
# (story the-study-material-has-a-contract). The contract's rules are the unit
# tests' (src/study/contract.test.ts); this is the command's contract: silent
# and 0 on valid material, one `file: path: message` line per problem and 1
# otherwise — an invalid topic reported, never skipped.
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
jq '.items |= map(.variation = false)' "$EXAMPLE/practice.json" > "$work/bd-labels-are-null/practice.json"
check "a broken topic fails" "$(run "$work/bd-labels-are-null")" "1"
check "naming the file, the path and the rule" "$(grep -c '^practice.json: /items: .*variation' "$work/out")" "1"

check "several topics are checked in one call, failing if any fails" "$(run "$EXAMPLE" "$work/bd-labels-are-null")" "1"
check "each problem once, named by its topic's folder" "$(grep -c . "$work/out") $(grep -c "^practice.json" "$work/out")" "2 1"
check "a folder that is not a topic is reported, not skipped" "$(run "$work/nowhere") $(grep -c 'practice.json: .*missing' "$work/out")" "1 1"
check "no folder at all is a usage error" "$(run)" "2"

if [ "$failures" -gt 0 ]; then
    echo "study-validate.test: $failures failure(s)"
    exit 1
fi
echo "study-validate.test: valid material passes in silence; anything else is one line per problem, never skipped."
