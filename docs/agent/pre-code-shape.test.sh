#!/usr/bin/env bash
# What check-parity.sh cannot see about the pre-code step of Pair Programming
# Mode (story the-agent-states-the-implementations-shape-before-writing-it,
# #185).
#
# The step was extended rather than doubled: one statement, the shape the
# implementation will take and then the three worst failures that shape can
# cause. Its three ways to fail, checked in every language folder:
#
#   - **it turns into a question.** An agent that states the shape and waits
#     brings back the round trip this mode exists to remove; the step says it is
#     a statement, not a question.
#   - **it becomes two rituals, or the failures fall off.** There is exactly one
#     bold "before writing code" sentence, and it names both.
#   - **the languages drift.** Parity sees headings, not words, so each
#     language carries its own markers here, and one without them fails.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${AGENT_DOCS_DIR:-$HERE}"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}

# per language: the bold step's opening | the phrase naming the shape | the failures | the statement marker
declare -A MARKERS=(
    [en]='**Before writing code|the shape the implementation will take|three worst failure|It is a statement, not a question'
    [pt-BR]='**Antes de escrever código|a forma que a implementação vai ter|três piores|É uma declaração, não uma pergunta'
)

for dir in "$ROOT"/*/; do
    lang="$(basename "$dir")"
    modes="$dir/MODES.md"
    [ -f "$modes" ] || continue
    spec="${MARKERS[$lang]:-}"
    check "$lang: markers for the pre-code step are known for this language" "$([ -n "$spec" ] && echo yes || echo no)" "yes"
    [ -n "$spec" ] || continue
    IFS='|' read -r opening shape failures_word statement <<<"$spec"

    # Pair Programming Mode is the first level-2 section; read it as one line,
    # because a bold sentence wraps.
    text="$(awk '/^## /{i++; next} i==1' "$modes" | tr '\n' ' ' | tr -s ' ')"
    steps="$(grep -oF -- "$opening" <<<"$text" | grep -c . || true)"
    check "$lang: exactly one bold pre-code step, not a second statement beside it" "$steps" "1"
    bold="$(grep -oP -- "\Q$opening\E.*?\*\*" <<<"$text" | head -n 1 || true)"
    check "$lang: the step names the shape" "$(grep -ciF -- "$shape" <<<"$bold" || true)" "1"
    check "$lang: and the three worst failures, in the same sentence" "$(grep -ciF -- "$failures_word" <<<"$bold" || true)" "1"
    check "$lang: and says it is a statement, not a question" "$(grep -oF -- "$statement" <<<"$text" | grep -c . || true)" "1"
done

if [ "$failures" -gt 0 ]; then echo "pre-code-shape.test: $failures failure(s)"; exit 1; fi
echo "pre-code-shape.test: in every language the pre-code step is one statement — the shape, then the three worst failures — said rather than asked."
