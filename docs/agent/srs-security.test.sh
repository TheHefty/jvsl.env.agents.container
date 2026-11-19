#!/usr/bin/env bash
# The SRS carries the application's threat model (story
# the-srs-carries-the-applications-threat-model, gh-362, task
# the-srs-template-carries-the-security-section).
#
# Security was decided by the agent, one change at a time, against nothing
# written down: what has value, who would want it, and through which entry
# were never asked. The SRS template now has a Security section in three
# parts, each with an owner. The ways it fails, checked here, in both
# languages:
#
#   - **the section is missing**, so an SRS is agreed with no threat model.
#   - **a part is missing**: a threat model with no controls is a worry, and
#     controls with no accepted risks claim a safety nobody signed for.
#   - **the owners blur**: the agent writing the threat model or choosing the
#     controls is exactly what this replaces. The user writes the threat model
#     and the accepted risks; the agent proposes controls as an options list,
#     the simplest always on it, each with its cost and what would have to be
#     true; the user chooses.
#   - **it is optional**: a section the gate does not require gets left empty.
#   - **the languages drift** — parity sees headings; this sees the words.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}
# section <file> <level> <heading>: the text under that heading, to the next
# heading of the same level or higher. Empty when the heading is absent.
section() {
    awk -v lvl="$2" -v want="$3" '
        /^#+ / { n = index($0, " ") - 1
                 if (on && n <= lvl) exit
                 if (n == lvl && substr($0, n + 2) == want) { on = 1; next } }
        on { print }' "$1"
}
has() { grep -ciF -- "$2" <<<"$1" || true; }
yes_if() { [ "$1" -gt 0 ] && echo yes || echo no; }

# lang | Security | Threat model | Controls | Accepted risks | user | agent | mandatory | simplest | cost | would have to be true | chooses
while IFS='|' read -r lang sec threat controls risks user agent mandatory simplest cost true chooses; do
    f="$HERE/$lang/SRS-TEMPLATE.md"
    s="$(section "$f" 2 "$sec")"
    check "$lang: the SRS template has a $sec section" "$(yes_if "${#s}")" "yes"
    check "$lang: it is required at the SRS's gate" "$(yes_if "$(has "$s" "$mandatory")")" "yes"

    t="$(section "$f" 3 "$threat")"; c="$(section "$f" 3 "$controls")"; r="$(section "$f" 3 "$risks")"
    for part in "$threat" "$controls" "$risks"; do
        check "$lang: $sec has the part $part" "$(grep -cxF "### $part" <<<"$s" || true)" "1"
    done

    check "$lang: the threat model asks what has value, who would want it, through which entry" \
        "$(yes_if "$(has "$t" "$(cut -d, -f1 <<<"$true")")") $(yes_if "$(has "$t" "$(cut -d, -f2 <<<"$true")")") $(yes_if "$(has "$t" "$(cut -d, -f3 <<<"$true")")")" "yes yes yes"
    check "$lang: the threat model is written by the user" "$(yes_if "$(has "$t" "$user")")" "yes"
    check "$lang: the controls are proposed by the agent" "$(yes_if "$(has "$c" "$agent")")" "yes"
    check "$lang: as an options list with the simplest always on it" "$(yes_if "$(has "$c" "$simplest")")" "yes"
    check "$lang: each with its cost and what would have to be true" \
        "$(yes_if "$(has "$c" "$cost")") $(yes_if "$(has "$c" "$(cut -d, -f4 <<<"$true")")")" "yes yes"
    check "$lang: and the user chooses" "$(yes_if "$(has "$c" "$chooses")")" "yes"
    check "$lang: the accepted risks are written by the user" "$(yes_if "$(has "$r" "$user")")" "yes"
done <<'TABLE'
en|Security|Threat model|Controls|Accepted risks|written by the user|proposed by the agent|before the SRS is agreed|simplest|cost|what has value,who would want it,which entry,what would have to be true|the user chooses
pt-BR|Segurança|Modelo de ameaças|Controles|Riscos aceitos|escrito pelo usuário|propostos pelo agente|antes de o SRS ser acordado|mais simples|custo|o que tem valor,quem o quereria,por qual entrada,o que teria de ser verdade|o usuário escolhe
TABLE

if [ "$failures" -gt 0 ]; then
    echo "srs-security.test: $failures failure(s)"
    exit 1
fi
echo "srs-security.test: the SRS template carries a required Security section in three parts, each with its owner, in both languages."
