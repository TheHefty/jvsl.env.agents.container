#!/usr/bin/env bash
# The refine skill's text, held to the threat-model question (story
# the-trackers-story-gate-asks-about-the-threat-model, gh-362; task
# refine-propose-requires-the-threat-model-line). refine-propose refuses a
# story without the answer; the skill is what asks the developer for it, so the
# answer is theirs and not a line the agent adds to get past the refusal.
#
# The ways it fails:
#   1. the question is not asked while grilling a story, so the line is
#      written by the agent alone;
#   2. the skill does not say the body carries the line, so every story is
#      refused once and patched;
#   3. a project with no Security section gets a section invented by the agent
#      instead of being stopped until the developer writes it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$HERE/refine/SKILL.md"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}
has() { if grep -qF -- "$1" "$SKILL"; then echo yes; else echo no; fi; }

check "1: grilling a story asks whether it changes the threat model" "$(has '**the threat model**, for a story')" "yes"
check "1: naming what changes it: a new surface, new data, a new role" "$(has 'a new surface, new data, or a new role')" "yes"
check "1: and the answer is the developer's" "$(has "The answer is the developer's")" "yes"
check "the question is asked while grilling, before anything is written" \
    "$(awk '/^## 3\. Grill/{a=NR} /the threat model\*\*, for a story/{b=NR} /^## 4\. Propose/{c=NR} END{print (a && a<b && b<c) ? "in order" : "out of order"}' "$SKILL")" "in order"
check "2: the story's body carries one of the two lines" "$(has '`Threat model: unchanged`, with why, or `Threat model: amended in <ref>`')" "yes"
check "2: and the script's refusal is listed with the others" "$(has 'a story whose body does not say whether it changes the threat model')" "yes"
check "3: with no Security section, refinement of stories stops until the developer writes it" \
    "$(has 'Stop, and ask the developer to write it first')" "yes"

if [ "$failures" -gt 0 ]; then
    echo "refine-skill.test: $failures failure(s)"
    exit 1
fi
echo "refine-skill.test: grilling a story asks whether it changes the threat model, and the answer goes in its body, in the developer's words."
