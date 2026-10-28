#!/usr/bin/env bash
# Holds the working day's documents to the plugin that implements them (story
# the-working-agreement-describes-the-day), in both languages.
#
# The failures it guards: the rules naming a ceremony the plugin no longer has,
# or the plugin gaining one nobody is told about; a rule that binds every turn
# living only in WORKING-DAY.md, which is not loaded unless it is the subject;
# and the two languages naming different commands. Headings and links are
# check-parity.sh's; this is what parity cannot see — the code inside the prose.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS="${AGENT_DOCS_DIR:-$HERE}"
SKILLS="${AGENT_PLUGIN_SKILLS:-$HERE/../../core/plugin/agent-container/skills}"

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

# The ceremonies are the ones WORKING-DAY.md's table declares. The plugin can
# carry other skills — the project report is one — so the comparison is with
# that table, and each ceremony in it has to exist in the plugin.
plugin="$(grep -oE '^\| [A-Za-z]+ \| `agent-container:[a-z-]+`' "$DOCS/en/WORKING-DAY.md" | grep -oE 'agent-container:[a-z-]+' | sed 's/^agent-container://' | sort -u | paste -sd' ' -)"
check "WORKING-DAY.md declares the four ceremonies" "$plugin" "planning refine retro review"
for c in $plugin; do
    check "the ceremony $c is a skill in the plugin" "$([ -f "$SKILLS/$c/SKILL.md" ] && echo yes || echo no)" "yes"
done

# The working-day section of RULES.md, from its heading to the next one.
section() { awk -v h="$2" '$0 == h {on = 1; print; next} on && /^#{1,3} / {on = 0} on' "$DOCS/$1/RULES.md"; }
declare -A heading=([en]="### The working day" [pt-BR]="### O dia de trabalho")
declare -A never=([en]="never skipped" [pt-BR]="nunca é pulada")
declare -A explain=([en]="explain" [pt-BR]="explic")

for lang in en pt-BR; do
    rules="$(section "$lang" "${heading[$lang]}")"
    check "$lang: RULES.md has its working-day section" "$([ -n "$rules" ] && echo yes || echo no)" "yes"
    check "$lang: the skills it names are exactly the ceremonies" \
        "$(printf '%s\n' "$rules" | grep -oE 'agent-container:[a-z-]+' | sed 's/^agent-container://' | sort -u | paste -sd' ' -)" "$plugin"
    check "$lang: it says the retro is never skipped" "$(printf '%s\n' "$rules" | grep -c "${never[$lang]}" | sed 's/^[1-9][0-9]*$/yes/')" "yes"
    check "$lang: it says a task is done when the developer can explain it" "$(printf '%s\n' "$rules" | grep -ci "${explain[$lang]}" | sed 's/^[1-9][0-9]*$/yes/')" "yes"
    check "$lang: it says how a task records its pull request" "$(printf '%s\n' "$rules" | grep -c -- '--set-metadata pr=' | sed 's/^[1-9][0-9]*$/yes/')" "yes"
    check "$lang: it links to WORKING-DAY.md for the rest" "$(printf '%s\n' "$rules" | grep -c '](WORKING-DAY.md' | sed 's/^[1-9][0-9]*$/yes/')" "yes"

    day="$DOCS/$lang/WORKING-DAY.md"
    check "$lang: WORKING-DAY.md exists" "$([ -f "$day" ] && echo yes || echo no)" "yes"
    [ -f "$day" ] || continue
    # journal-write refuses any other names, in any language.
    for s in Discovered Surprised "Went wrong" "Decided alone" "What I learned" "Left open" Links; do
        check "$lang: the journal's section \"## $s\" is named as journal-write reads it" "$(grep -cx "## $s" "$day" | sed 's/^[1-9][0-9]*$/yes/')" "yes"
    done
done

# Code is code in either language: the commands and names in backticks agree.
codes() { grep -oE '`[^`]+`' "$DOCS/$1/WORKING-DAY.md" 2>/dev/null | sort -u; }
check "the two WORKING-DAY.md name the same commands and names" "$(diff <(codes en) <(codes pt-BR) | grep -c '^[<>]' || true)" "0"

if [ "$failures" -gt 0 ]; then
    echo "working-day.test: $failures failure(s)"
    exit 1
fi
echo "working-day.test: both languages name exactly the plugin's ceremonies, carry what binds every turn, and agree on every command."
