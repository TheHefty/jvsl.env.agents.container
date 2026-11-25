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

# --- idea-check --set <state> (story an-idea-is-consolidated-before-it-is-
# ready, gh-364; task the-ideation-skill-consolidates-before-ready) ---------
#
# The ready step changes the state through idea-check, so the check and the
# write are one step. The ways it fails:
#   1. the state is written and the check runs after: an incomplete idea is
#      left ready, which Create project then starts from;
#   2. the write reformats the file: stacks, comments or the body change under
#      a state change the developer agreed to;
#   3. the agent writes `became project`, which only the extension marks.
idea="$work/an-idea"
mkdir -p "$idea"
sed 's/^state: ready$/state: exploring/' "$EXAMPLES/ready-whole/IDEA.md" > "$idea/IDEA.md"
cp "$idea/IDEA.md" "$work/before.md"

sed -i 's/^- Which OCR model.*$//' "$idea/IDEA.md"
cp "$idea/IDEA.md" "$work/incomplete.md"
check "1: an idea with an empty section is refused ready" "$(run --set ready "$idea")" "1"
check "1:   naming the section" "$(grep -c 'Open questions' "$work/out")" "1"
check "1:   and the file is left byte for byte as it was" "$(cmp -s "$idea/IDEA.md" "$work/incomplete.md" && echo same || echo changed)" "same"

cp "$work/before.md" "$idea/IDEA.md"
check "a whole idea is set ready" "$(run --set ready "$idea")" "0"
check "  and says which file moved from which state" "$(grep -c 'exploring -> ready' "$work/out")" "1"
check "  it is ready by the contract now" "$(run "$idea")" "0"
check "2: only the state line changed" \
    "$(diff "$work/before.md" "$idea/IDEA.md" | grep -E '^[<>]' | tr '\n' '|')" "< state: exploring|> state: ready|"

cp "$work/before.md" "$idea/IDEA.md"
check "an idea can be set back to exploring, or discarded" "$(run --set discarded "$idea"; run --set exploring "$idea")" "0
0"
check "3: became project is refused: only the extension marks it" "$(run --set 'became project: x' "$idea") $(grep -c 'extension' "$work/out")" "2 1"
check "3:   and the file is left as it was" "$(cmp -s "$idea/IDEA.md" "$work/before.md" && echo same || echo changed)" "same"
check "a state outside the list is a usage error" "$(run --set finished "$idea")" "2"
check "--set with no idea is a usage error" "$(run --set ready)" "2"
printf -- '---\nstate: exploring\nfoo: bar\n---\n' > "$work/broken.md"
cp "$work/broken.md" "$work/broken-before.md"
check "an idea the contract refuses already is not written" "$(run --set discarded "$work/broken.md") $(cmp -s "$work/broken.md" "$work/broken-before.md" && echo same || echo changed)" "1 same"

if [ "$failures" -gt 0 ]; then
    echo "idea-check.test: $failures failure(s)"
    exit 1
fi
echo "idea-check.test: idea-check accepts and refuses every shared example as expect.json says, with the same lines and reasons as the extension."
