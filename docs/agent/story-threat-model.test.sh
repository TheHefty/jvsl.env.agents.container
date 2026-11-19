#!/usr/bin/env bash
# The story gate asks whether the threat model changes (story a-story-that-
# changes-the-threat-model-amends-it-first, gh-362; task the-story-gate-asks-
# whether-the-threat-model-changes).
#
# The SRS carries a threat model since kr7.1. It goes stale the way every
# design document does: a story adds a surface, some data or a role, and
# nobody goes back to it. The ways the gate fails, checked here, in both
# languages:
#
#   - **the question is not asked** at the story gate, so a new surface slips in.
#   - **the amendment comes after the code**: it has to land in the same pull
#     request as the story, before any task under it.
#   - **"unchanged" is assumed rather than said**, with no reason a reader can
#     check. The line is literal and in English in both languages, because
#     refine-propose is to require it by text (kr7.4.1).
#   - **a project from before the section** never gets one: its next story gate
#     stops and asks for the threat model first.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}
# Line breaks folded, so a phrase found where the prose wrapped still counts.
flat() { tr '\n' ' ' < "$1" 2>/dev/null | tr -s ' ' || true; }
has() { grep -ciF -- "$2" <<<"$1" || true; }
yes_if() { [ "$1" -gt 0 ] && echo yes || echo no; }

# lang | the question (three words) | same pull request | before any task | no Security section | stops and asks | heading
while IFS='|' read -r lang question samepr beforetask nosection asks heading; do
    w="$(flat "$HERE/$lang/WORKFLOW.md")"
    s="$(flat "$HERE/$lang/STORY-TEMPLATE.md")"
    IFS=, read -r q1 q2 q3 _ <<<"$question"
    for doc in WORKFLOW STORY-TEMPLATE; do
        t="$w"; [ "$doc" = STORY-TEMPLATE ] && t="$s"
        check "$lang $doc: asks whether the story adds a surface, data or a role" \
            "$(yes_if "$(has "$t" "$q1")") $(yes_if "$(has "$t" "$q2")") $(yes_if "$(has "$t" "$q3")")" "yes yes yes"
        check "$lang $doc: the literal line for no change" "$(yes_if "$(has "$t" 'Threat model: unchanged')")" "yes"
        check "$lang $doc: the literal line for an amendment" "$(yes_if "$(has "$t" 'Threat model: amended in <ref>')")" "yes"
    done
    check "$lang WORKFLOW: the SRS's Security section is amended in the same pull request as the story" "$(yes_if "$(has "$w" "$samepr")")" "yes"
    check "$lang WORKFLOW: before any task under it" "$(yes_if "$(has "$w" "$beforetask")")" "yes"
    check "$lang WORKFLOW: a project whose SRS has no Security section" "$(yes_if "$(has "$w" "$nosection")")" "yes"
    check "$lang WORKFLOW: is stopped and asked for its threat model at the next story gate" "$(yes_if "$(has "$w" "$asks")")" "yes"
    check "$lang STORY-TEMPLATE: has the section $heading" "$(grep -cxF "## $heading" "$HERE/$lang/STORY-TEMPLATE.md" || true)" "1"
    check "$lang STORY-TEMPLATE: says unchanged comes with why" "$(yes_if "$(has "$s" "$(cut -d, -f4 <<<"$question")")")" "yes"
done <<'TABLE'
en|new surface,new data,new role,with why|in the same pull request as the story|before any task|has no Security section|stops and asks the user to write the threat model first|Threat model
pt-BR|nova superfície,novo dado,novo papel,com o porquê|no mesmo pull request da estória|antes de qualquer task|não tem seção Segurança|para e pede ao usuário que escreva o modelo de ameaças antes|Modelo de ameaças
TABLE

if [ "$failures" -gt 0 ]; then
    echo "story-threat-model.test: $failures failure(s)"
    exit 1
fi
echo "story-threat-model.test: the story gate asks whether the threat model changes, amends it first or says why not, and asks a project without one for it, in both languages."
