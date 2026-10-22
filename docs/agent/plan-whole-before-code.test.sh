#!/usr/bin/env bash
# The rule that a round of work is planned whole before any of it is built:
# every epic it gives rise to, and every story under each with its scenarios,
# agreed before the first task of any of them. Asked for by the operator on
# 2026-10-22, after a round of five issues was planned and built one story at a
# time.
#
# It lives in six places — WORKFLOW and RULES in each language, and the
# CLAUDE.md of this repository and of the project template, which carry the
# gates in their own bodies so they survive the rules not loading. The ways it
# fails, checked here:
#
#   - **two rules at once.** The old "one story and one task at a time" left
#     beside the new one, and an agent picks whichever it read last.
#   - **the languages or the copies drift.** Parity sees headings, not words.
#   - **it is read as "nothing may come up later".** Work found along the way —
#     a defect, a debt — needs a way in: it is planned whole too, before its own
#     code, and does not unplan what was agreed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}
has() { grep -cF -- "$2" "$1" 2>/dev/null || true; }

# per language: the rule | the way in for work found later
declare -A RULE=(
    [en]='planned whole before any of it is built'
    [pt-BR]='planejada inteira antes de qualquer parte dela ser construída'
)
declare -A LATER=(
    [en]='Work found along the way'
    [pt-BR]='Trabalho encontrado no caminho'
)

for dir in "$HERE"/*/; do
    lang="$(basename "$dir")"
    [ -f "$dir/WORKFLOW.md" ] || continue
    check "$lang: the rule is known for this language" "$([ -n "${RULE[$lang]:-}" ] && echo yes || echo no)" "yes"
    rule="${RULE[$lang]:-<none>}"; later="${LATER[$lang]:-<none>}"
    check "$lang: WORKFLOW states it" "$(has "$dir/WORKFLOW.md" "$rule")" "1"
    check "$lang: WORKFLOW gives work found along the way its way in" "$(has "$dir/WORKFLOW.md" "$later")" "1"
    check "$lang: RULES states it" "$(has "$dir/RULES.md" "$rule")" "1"
done

for f in "$REPO/CLAUDE.md" "$REPO/assets/project/CLAUDE.md"; do
    rel="${f#"$REPO"/}"
    check "$rel states it beside the gates" "$(has "$f" "${RULE[en]}")" "1"
    check "$rel no longer says one story at a time" "$(has "$f" 'one story and one task at a time')" "0"
done

if [ "$failures" -gt 0 ]; then echo "plan-whole-before-code.test: $failures failure(s)"; exit 1; fi
echo "plan-whole-before-code.test: in every language and in both CLAUDE.md files, a round of work is planned whole before it is built, and work found later has its way in."
