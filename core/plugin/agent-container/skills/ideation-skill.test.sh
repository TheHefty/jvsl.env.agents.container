#!/usr/bin/env bash
# The ideation skill's text, held to the story it serves (story
# an-idea-is-consolidated-before-it-is-ready, gh-364; task
# the-ideation-skill-consolidates-before-ready). A skill is instructions an
# agent follows; a sentence dropped from it is a behaviour dropped, and nothing
# else would notice.
#
# The memory of the ideation container does not follow an idea into its
# project: only IDEA.md crosses. The ways the ready step fails:
#   1. the state changes before the consolidation is written, or before the
#      developer has seen it: what lived only in memory is lost at Create;
#   2. the state is written by hand rather than through idea-check --set, so
#      an idea the contract refuses is left ready;
#   3. the agent sets the state on its own judgment, or writes became project,
#      which only the extension marks.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$HERE/ideation/SKILL.md"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}
has() { if [ -f "$SKILL" ] && grep -qF -- "$1" "$SKILL"; then echo yes; else echo no; fi; }
line() { if [ -f "$SKILL" ]; then grep -nF -- "$1" "$SKILL" | head -1 | cut -d: -f1; fi; }

check "the skill exists" "$([ -f "$SKILL" ] && echo yes || echo no)" "yes"
check "it is named ideation" "$(has 'name: ideation')" "yes"
check "the ready step is a step of its own" "$(has '## Marking an idea ready')" "yes"

# 1: read the memory, write what is missing, show it, wait — in that order.
check "1: it reads the memory for the idea" "$(has 'Read the memory for the idea')" "yes"
check "1: it names what to consolidate" \
    "$(has 'the decisions, the alternatives discarded and why, the stack, and the questions still open')" "yes"
check "1: it writes the consolidation into IDEA.md" "$(has 'Write what is missing into IDEA.md')" "yes"
check "1: it shows the developer what was added" "$(has 'Show the developer what was added')" "yes"
check "1: and asks before the state changes" "$(has 'Ask whether to mark it ready')" "yes"
read_at="$(line 'Read the memory for the idea')"; write_at="$(line 'Write what is missing into IDEA.md')"
show_at="$(line 'Show the developer what was added')"; ask_at="$(line 'Ask whether to mark it ready')"
set_at="$(line '${CLAUDE_PLUGIN_ROOT}/bin/idea-check --set ready')"
check "1: read, write, show, ask, then set — in that order" \
    "$([ -n "$read_at" ] && [ -n "$set_at" ] && [ "$read_at" -lt "$write_at" ] && [ "$write_at" -lt "$show_at" ] \
        && [ "$show_at" -lt "$ask_at" ] && [ "$ask_at" -lt "$set_at" ] && echo "in order" || echo "out of order")" "in order"

# 2: the state goes through idea-check, and a refusal is said, not fixed by hand.
check "2: the state is set through idea-check --set" "$(has '${CLAUDE_PLUGIN_ROOT}/bin/idea-check --set ready')" "yes"
check "2: it never edits the state: line by hand" "$(has 'Never edit the `state:` line by hand')" "yes"
check "2: a refusal is reported with its lines, and the idea stays as it was" \
    "$(has 'tell the developer each line it printed')" "yes"

# 3: the developer decides; became project is the extension's.
check "3: the state changes only on the developer's word" "$(has "only on the developer's word")" "yes"
check "3: it never writes became project" "$(has 'Never write `became project`')" "yes"

if [ "$failures" -gt 0 ]; then
    echo "ideation-skill.test: $failures failure(s)"
    exit 1
fi
echo "ideation-skill.test: the ready step consolidates into IDEA.md, shows it, waits for the developer, and sets the state only through idea-check."
