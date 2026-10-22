#!/usr/bin/env bash
# What check-parity.sh cannot see about the task template's "After the code"
# section (story the-task-records-five-checks-against-the-diff-after-the-code,
# #184).
#
# Parity compares structure across languages; it cannot tell that a section
# kept its shape for the reasons it has one. The three ways this section
# fails, each checked here in every language folder:
#
#   - **it becomes ceremony.** Five "none" answers cost nothing and say
#     nothing. The column for what was looked at is what makes "none" an
#     answer, so the table is five rows of three columns.
#   - **it is read as a pre-code gate**, and an agreed task is held up for a
#     section that cannot be filled yet. Its first paragraph says when it is
#     filled.
#   - **the tracker instruction loses data.** `bd update --notes` replaces an
#     item's notes; the rule must name --append-notes, and bd must have it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${AGENT_DOCS_DIR:-$HERE}"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}

# The sentence that says when the section is filled, per language. A language
# added without one fails here rather than passing unread.
declare -A WHEN=(
    [en]='Filled once the code exists'
    [pt-BR]='Preenchida quando o código já existe'
)

# The body of the Nth level-2 section of a file.
section() {
    awk -v n="$2" '/^## /{i++; next} i==n' "$1"
}

for dir in "$ROOT"/*/; do
    lang="$(basename "$dir")"
    tpl="$dir/TASK-TEMPLATE.md"
    [ -f "$tpl" ] || continue

    # Verification is the 7th level-2 section; this one follows it.
    body="$(section "$tpl" 8)"
    rows="$(grep -E '^\| *[1-5] *\|' <<<"$body" || true)"
    check "$lang: the section after Verification has five numbered checks" \
        "$(grep -c . <<<"$rows" || true)" "5"
    check "$lang: each check row has three columns besides its number" \
        "$(awk -F'|' '{print NF - 3}' <<<"$rows" | sort -u | tr '\n' ' ')" "3 "
    marker="${WHEN[$lang]:-}"
    check "$lang: a sentence saying when the section is filled is known for this language" \
        "$([ -n "$marker" ] && echo yes || echo no)" "yes"
    check "$lang: and the section's first paragraph carries it" \
        "$(awk 'NF{print; exit}' <<<"$body" | grep -cF -- "${marker:-<none>}" || true)" "1"

    wf="$dir/WORKFLOW.md"
    check "$lang: the tracker workflow records the checks with --append-notes" \
        "$(grep -c 'bd update <id> --append-notes' "$wf" || true)" "1"
    check "$lang: and never instructs --notes, which replaces what the item carries" \
        "$(grep -E 'bd update <id> --notes' "$wf" | grep -c . || true)" "0"
done

if command -v bd >/dev/null 2>&1; then
    check "the installed bd has --append-notes" "$(bd update --help 2>&1 | grep -q -- '--append-notes' && echo yes || echo no)" "yes"
else
    echo "SKIPPED, not passed: bd is not installed here, so its --append-notes flag was not checked"
fi

if [ "$failures" -gt 0 ]; then echo "post-code-checks.test: $failures failure(s)"; exit 1; fi
echo "post-code-checks.test: in every language the task template's After the code section is five checks of three columns, filled once the code exists, and the tracker records it with --append-notes."
