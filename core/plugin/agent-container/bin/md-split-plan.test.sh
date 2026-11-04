#!/usr/bin/env bash
# Exercises md-split-plan, the real script, on throwaway git repositories (story
# a-markdown-file-that-grew-past-the-limit-is-split-by-its-subjects, task qws.2.1).
#
# The ways a split goes wrong, each checked here:
#   1. prose lost or duplicated — the new files, read in order, must be the
#      original byte for byte, apart from the links the split had to rewrite;
#   2. an inbound link, with or without an #anchor, left pointing at a path that
#      no longer holds that section — and the relative links inside the moved
#      prose, which are one folder deeper now;
#   3. a single section over the limit planned as one file still over it;
#   4. anything written before the developer agreed — the plan writes nothing.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/md-split-plan"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
repo="$work/repo"; mkdir -p "$repo/docs"
git -C "$repo" init -q
filler() { python3 -I -c "import sys; print(('word ' * 18 + '\n') * int(sys.argv[1]), end='')" "$1"; }
{
    printf '# Rules\n\nThe preamble, which stays in front.\n\n'
    printf '## Security\n\nSee [the overview](OVERVIEW.md) and [testing](#testing).\n\n'; filler 200
    printf '\n## Testing\n\n### Test-first\n\nRed first.\n\n'; filler 200
    printf '\n## Documentation\n\nKeep it short.\n'; filler 200
} > "$repo/docs/RULES.md"
printf '# Overview\n' > "$repo/docs/OVERVIEW.md"
printf 'Read [the rules](docs/RULES.md), [test-first](docs/RULES.md#test-first) and [docs](./docs/RULES.md#documentation).\n' > "$repo/README.md"
git -C "$repo" add -A && git -C "$repo" -c user.email=t@t -c user.name=t commit -qm fixture
original="$(cat "$repo/docs/RULES.md")"

plan="$(cd "$repo" && LIMIT_KIB=20 bash "$SCRIPT" docs/RULES.md)" || plan="{}"
field() { printf '%s' "$plan" | python3 -I -c "import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1], {}, {'d': d}))" "$1"; }

check "the plan names the folder for the subject" "$(field "d['folder']")" "docs/rules"
check "one file per top-level section, and the index" \
    "$(field "' '.join(s['file'] for s in d['sections']) + ' ' + d['index']")" \
    "docs/rules/security.md docs/rules/testing.md docs/rules/documentation.md docs/rules/README.md"
check "4: planning writes nothing" "$(git -C "$repo" status --porcelain | wc -l | tr -d ' ')" "0"

(cd "$repo" && LIMIT_KIB=20 bash "$SCRIPT" --apply docs/RULES.md > /dev/null) || true

check "every file it wrote is under the limit" \
    "$(find "$repo/docs/rules" -name '*.md' -size +20k | wc -l | tr -d ' ')" "0"
check "the index lists the three sections" \
    "$(grep -c '](security.md)\|](testing.md)\|](documentation.md)' "$repo/docs/rules/README.md")" "3"
check "the preamble stays in front, in the index" "$(grep -c '^The preamble, which stays in front\.$' "$repo/docs/rules/README.md")" "1"

# 1. Every paragraph is in exactly one file, unchanged: the sections' bodies,
# with the rewritten links put back, read in order, are the original after its
# preamble.
rebuilt="$(cat "$repo/docs/rules/security.md" "$repo/docs/rules/testing.md" "$repo/docs/rules/documentation.md" 2>/dev/null \
    | sed -e 's#](../OVERVIEW.md)#](OVERVIEW.md)#' -e 's#](testing.md\#testing)#](\#testing)#' || true)"
expected="$(printf '%s\n' "$original" | sed -n '/^## Security$/,$p')"
check "1: nothing is lost or duplicated" "$(cmp -s <(printf '%s\n' "$rebuilt") <(printf '%s\n' "$expected") && echo same || echo differs)" "same"

# 2. Links in and out.
check "2: a link to the file now points at the index" "$(grep -c '](docs/rules/README.md)' "$repo/README.md")" "1"
check "2: a link to a subsection's anchor follows it to its file" "$(grep -c '](docs/rules/testing.md#test-first)' "$repo/README.md")" "1"
check "2: a ./-relative anchor link follows its section" "$(grep -c '](docs/rules/documentation.md#documentation)' "$repo/README.md")" "1"
check "2: an outbound relative link in the moved prose goes one folder up" "$(grep -c '](../OVERVIEW.md)' "$repo/docs/rules/security.md")" "1"
check "2: a link between two sections of the old file crosses files" "$(grep -c '](testing.md#testing)' "$repo/docs/rules/security.md")" "1"
check "the old path is a one-line pointer to the index, not a copy" \
    "$(wc -l < "$repo/docs/RULES.md" | tr -d ' ') $(grep -c 'rules/README.md' "$repo/docs/RULES.md")" "1 1"

# 3. A section too large on its own is reported, not planned as one big file.
big="$work/big"; mkdir -p "$big"; git -C "$big" init -q
{ printf '# Big\n\n## Huge\n\n'; filler 600; printf '\n## Small\n\nx\n'; } > "$big/BIG.md"; git -C "$big" add -A && git -C "$big" -c user.email=t@t -c user.name=t commit -qm fixture
code=0; out="$(cd "$big" && LIMIT_KIB=20 bash "$SCRIPT" BIG.md)" || code=$?
check "3: a section over the limit on its own is reported" \
    "$(printf '%s' "$out" | python3 -I -c "import json,sys; print(json.load(sys.stdin)['oversized'])")" "['Huge']"
code=0; (cd "$big" && LIMIT_KIB=20 bash "$SCRIPT" --apply BIG.md > "$work/out" 2>&1) || code=$?
check "3: and applying it is refused, naming the section, with nothing written" \
    "$code $(grep -c 'Huge' "$work/out") $(git -C "$big" status --porcelain | wc -l | tr -d ' ')" "1 1 0"

# CLAUDE.md stays the file that is loaded: its sections go to files it imports.
cl="$work/cl"; mkdir -p "$cl"; git -C "$cl" init -q
{ printf '# CLAUDE.md\n\nThe gates, kept here.\n\n## Standing answers\n\nEnglish.\n\n## Commands\n\n'; filler 150; } > "$cl/CLAUDE.md"; git -C "$cl" add -A && git -C "$cl" -c user.email=t@t -c user.name=t commit -qm fixture
(cd "$cl" && LIMIT_KIB=20 bash "$SCRIPT" --apply --keep 'Standing answers' CLAUDE.md > /dev/null) || true
check "CLAUDE.md keeps its preamble and the sections it was told to keep" \
    "$(grep -c '^The gates, kept here\.$\|^## Standing answers$' "$cl/CLAUDE.md")" "2"
check "and imports the rest with @path" "$(grep -c '^@claude/commands.md$' "$cl/CLAUDE.md") $(test -f "$cl/claude/commands.md" && echo moved)" "1 moved"

check "CHANGELOG.md is refused" "$(cd "$repo" && printf '# c\n' > CHANGELOG.md && git add CHANGELOG.md && { bash "$SCRIPT" CHANGELOG.md > /dev/null 2>&1; echo $?; })" "1"

if [ "$failures" -gt 0 ]; then
    echo "md-split-plan.test: $failures failure(s)"
    exit 1
fi
echo "md-split-plan.test: a split keeps every byte of prose, follows every link, and refuses what the rules refuse."
