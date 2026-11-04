#!/usr/bin/env bash
# The retro skill's text, held to what the developer agreed (epic
# the-retro-elaborates-on-what-the-developer-wants-to-learn, 3kk). A skill is
# instructions an agent follows; a sentence dropped from it is a behaviour
# dropped, and nothing else would notice.
#
# Story 3kk.1, the elaboration in the conversation — the ways it fails:
#   1. it loses its grounding: a lecture about the topic instead of where it
#      showed up in today's work;
#   2. it lets the agent rewrite the developer's line;
#   3. it loses "say so when nothing connects", so an invented connection to
#      the day reads as fact.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$HERE/retro/SKILL.md"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}
has() { if grep -qF -- "$1" "$SKILL"; then echo yes; else echo no; fi; }

check "the retro elaborates on the developer's line, as its own step" "$(has '## 5. Elaborate on what the developer wants to learn')" "yes"
check "it explains what the topic is and why it matters in this project" "$(has 'what the topic is, and why it matters in this project')" "yes"
check "1: grounded in today's work, by file, commit or tracker item" "$(has 'by file, commit or tracker item')" "yes"
check "and says what to read or try next" "$(has 'what to read or try next')" "yes"
check "2: the developer's line is never changed by it" "$(has 'Never change their line')" "yes"
check "3: when nothing in the day touches the topic, it says so" "$(has "When nothing in today's work touches the topic, say so")" "yes"
check "the elaboration comes after the line, before the entry is written" \
    "$(awk '/^## 4\. /{a=NR} /^## 5\. Elaborate/{b=NR} /^## [0-9]+\. Write the entry/{c=NR} END{print (a<b && b<c) ? "in order" : "out of order"}' "$SKILL")" "in order"

# Story 3kk.2: the elaboration goes in the entry, in its own section, and says
# whose it is — the template is what the agent copies.
check "the entry's template carries the elaboration after the developer's line" \
    "$(awk '/^## What I want to learn$/{a=NR} /^## On what I want to learn$/{b=NR} /^## Left open$/{c=NR} END{print (a && a<b && b<c) ? "in order" : "missing or out of order"}' "$SKILL")" "in order"
check "and its section opens by saying it is the agent's" "$(has 'opening with "Written by the agent."')" "yes"

if [ "$failures" -gt 0 ]; then
    echo "retro-skill.test: $failures failure(s)"
    exit 1
fi
echo "retro-skill.test: the retro elaborates on the developer's line, grounded in the day, without changing it."
