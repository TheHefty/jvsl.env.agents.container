#!/usr/bin/env bash
# Exercises idea-check, the real script, against the shared examples (story
# the-ideas-have-a-contract, gh-364; task the-plugin-checks-an-idea-against-
# the-same-contract).
#
# The extension checks IDEA.md on the host (src/ideas/contract.ts); the agent
# checks it in the container with idea-check. Both run one file,
# ideas/contract.mjs, and both are held to the same examples and their
# expect.json, so they accept and refuse exactly the same ideas for the same
# named reasons. The command's contract: silent and 0 on a valid idea; one
# `<file>:<line>: <message>` line per problem (`<file>: <message>` when the
# problem is something missing) and 1 otherwise; 2 on a usage error.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLES="$HERE/../ideas/examples"

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
run() { local code=0; bash "$HERE/idea-check" "$@" > "$work/out" 2>&1 || code=$?; echo "$code"; }

mapfile -t names < <(find "$EXAMPLES" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
check "the shared examples are there, so this cannot pass on none" "$([ "${#names[@]}" -ge 11 ] && echo yes || echo "${#names[@]}")" "yes"

for name in "${names[@]}"; do
    e="$EXAMPLES/$name/expect.json"
    if [ "$(jq -r .valid "$e")" = true ]; then
        check "$name is valid" "$(run "$EXAMPLES/$name/IDEA.md")" "0"
        check "  and says nothing" "$(wc -c < "$work/out" | tr -d ' ')" "0"
        continue
    fi
    check "$name is refused" "$(run "$EXAMPLES/$name/IDEA.md")" "1"
    check "  with one line per problem expect.json names" "$(wc -l < "$work/out" | tr -d ' ')" "$(jq '.problems | length' "$e")"
    i=0
    while IFS=$'\t' read -r line includes; do
        i=$((i + 1))
        got="$(sed -n "${i}p" "$work/out")"
        if [ "$line" = null ]; then want="$EXAMPLES/$name/IDEA.md: "; else want="$EXAMPLES/$name/IDEA.md:$line: "; fi
        check "  problem $i names line $line" "$([ "${got#"$want"}" != "$got" ] && echo yes || echo "$got")" "yes"
        check "  problem $i carries \"$includes\"" "$(grep -cF -- "$includes" <<<"$got" || true)" "1"
    done < <(jq -r '.problems[] | [(.line | tostring), .includes] | @tsv' "$e")
done

# An idea's folder works as well as its file: the agent works in folders.
check "an idea's folder is read as its IDEA.md" "$(run "$EXAMPLES/ready-whole")" "0"
check "a folder with no IDEA.md is refused, saying so" "$(run "$work") $(grep -c 'no IDEA.md' "$work/out")" "1 1"
check "no argument is a usage error" "$(run)" "2"

if [ "$failures" -gt 0 ]; then
    echo "idea-check.test: $failures failure(s)"
    exit 1
fi
echo "idea-check.test: idea-check accepts and refuses every shared example as expect.json says, with the same lines and reasons as the extension."
