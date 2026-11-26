#!/usr/bin/env bash
# The rule that an epic reaches master whole (epic an-epic-reaches-master-whole,
# story the-rules-make-the-epic-the-merge-gate-for-master). It replaced "the epic
# does not hold a release", which let every story merge straight into master, so
# a release shipped whatever half of an epic had landed: kotodori 0.91.0 almost
# did.
#
# It lives in RULES and WORKFLOW, in each language. The ways it fails, checked
# here:
#
#   - **two rules at once.** The old sentence left beside the new one, and an
#     agent follows whichever it read last.
#   - **a language loses a piece.** Parity sees headings, not words: the branch
#     shape, the one merge into master with an empty body, the fix that goes
#     straight to master, or who configures the protection.
#   - **the protection reads as the extension's job.** It sets none in any
#     project; the developer configures it, and the rule says so.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}
# Read as one line with runs of whitespace squeezed, so a phrase the Markdown
# wrapped across two lines still counts: rewrapping a paragraph is not losing it.
has() {
    if [ -f "$1" ] && tr -s '[:space:]' ' ' <"$1" | grep -qF -- "$2"; then echo yes; else echo no; fi
}

# The branch names are the same in every language.
SHAPE=('`story/<epic>/<story>`' '`epic/<epic>`')

# per language, separated by '|': what both RULES and WORKFLOW must say
declare -A BOTH=(
    [en]='with an empty body|a title that is not conventional|A fix does not wait for an epic|take `master` in|the developer configures|no force-push|no deletion'
    [pt-BR]='com o corpo vazio|um título que não é convencional|Um fix não espera um épico|incorporam `master`|o desenvolvedor configura|sem force-push|sem exclusão'
)
# what RULES must say besides
declare -A RULES_ONLY=(
    [en]='squashes into its story|finishes under the old flow'
    [pt-BR]='entra por squash na sua estória|termina no fluxo antigo'
)
# what neither may say any more
declare -A GONE=(
    [en]='does not hold a release|not a merge gate'
    [pt-BR]='não segura uma release|não um gate de merge'
)

for dir in "$HERE"/*/; do
    lang="$(basename "$dir")"
    [ -f "$dir/RULES.md" ] || continue
    check "$lang: the rule is known for this language" "$([ -n "${BOTH[$lang]:-}" ] && echo yes || echo no)" "yes"
    for doc in RULES.md WORKFLOW.md; do
        f="$dir/$doc"
        for s in "${SHAPE[@]}"; do check "$lang/$doc names the branch $s" "$(has "$f" "$s")" "yes"; done
        IFS='|' read -ra want <<<"${BOTH[$lang]:-}"
        for s in "${want[@]}"; do check "$lang/$doc says: $s" "$(has "$f" "$s")" "yes"; done
        IFS='|' read -ra gone <<<"${GONE[$lang]:-}"
        for s in "${gone[@]}"; do check "$lang/$doc no longer says: $s" "$(has "$f" "$s")" "no"; done
    done
    IFS='|' read -ra want <<<"${RULES_ONLY[$lang]:-}"
    for s in "${want[@]}"; do check "$lang/RULES.md says: $s" "$(has "$dir/RULES.md" "$s")" "yes"; done
done

if [ "$failures" -gt 0 ]; then echo "epic-is-the-merge-gate.test: $failures failure(s)"; exit 1; fi
echo "epic-is-the-merge-gate.test: in every language, RULES and WORKFLOW make the epic the merge gate for master, and the old rule is gone."
