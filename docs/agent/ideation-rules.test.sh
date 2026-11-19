#!/usr/bin/env bash
# The ideation container's rules are written (story the-brainstorm-command-
# opens-the-ideation-container, gh-364; task the-ideation-rules-are-written).
#
# A Brainstorm container runs under IDEATION.md instead of the development
# rules. The ways those rules fail, checked here, in both languages:
#
#   - **code gets written** in a container that is not a project, and the idea
#     arrives at Create project as a half-built repository nobody agreed to.
#   - **ideas lose their place**: not one folder per idea, not the contract, no
#     state — then Create project cannot tell which one is ready.
#   - **a conversation per idea**, against the one agreed: the agent stops
#     asking which idea to continue, and an idea is lost in a session.
#   - **memory is trusted to cross**: it does not (one memory per container),
#     so what lives only there is consolidated into IDEA.md before ready.
#   - **the agent marks an idea became project**, which only the extension does
#     when it creates the project.
#   - **it leaks into projects**: the boot installs MODES.md and RULES.md in
#     every container, and a "no code is written" rule there would stop all work.
#     It installs IDEATION.md only with AGENT_CONTAINER_MODE=ideation.
#   - **the languages drift** — parity sees headings; this sees the words.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}
# Matches are on the text with its line breaks folded, so a phrase that wraps
# where the prose did is still found.
flat() { tr '\n' ' ' < "$1" 2>/dev/null | tr -s ' ' || true; }
has() { grep -ciF -- "$2" <<<"$1" || true; }
yes_if() { [ "$1" -gt 0 ] && echo yes || echo no; }

# lang | no code | one conversation | which to continue | start another | only in memory | the extension marks it
while IFS='|' read -r lang nocode oneconv whichone another memory extension; do
    f="$HERE/$lang/IDEATION.md"
    t="$(flat "$f")"
    check "$lang: IDEATION.md exists" "$([ -f "$f" ] && echo yes || echo no)" "yes"
    check "$lang: no code is written" "$(yes_if "$(has "$t" "$nocode")")" "yes"
    check "$lang: one folder per idea, at ideas/<slug>/IDEA.md" "$(yes_if "$(has "$t" 'ideas/<slug>/IDEA.md')")" "yes"
    for s in raw exploring ready discarded 'became project'; do
        check "$lang: names the state $s" "$(yes_if "$(has "$t" "\`$s")")" "yes"
    done
    for s in 'Purpose and who it is for' 'Decisions and discarded alternatives' '## Stack' 'Open questions'; do
        check "$lang: names the section $s as the contract spells it" "$(yes_if "$(has "$t" "$s")")" "yes"
    done
    check "$lang: points at the contract the parser holds" "$(yes_if "$(has "$t" 'ideas/README.md')")" "yes"
    check "$lang: one conversation for all ideas" "$(yes_if "$(has "$t" "$oneconv")")" "yes"
    check "$lang: asks which idea to continue, or whether to start another" \
        "$(yes_if "$(has "$t" "$whichone")") $(yes_if "$(has "$t" "$another")")" "yes yes"
    check "$lang: what lives only in memory is consolidated into IDEA.md before ready" "$(yes_if "$(has "$t" "$memory")")" "yes"
    check "$lang: the extension marks became project, never the agent" "$(yes_if "$(has "$t" "$extension")")" "yes"
done <<'TABLE'
en|no code is written|one conversation for all ideas|which idea to continue|start another|only in memory|only the extension marks
pt-BR|nenhum código é escrito|uma conversa para todas as ideias|qual ideia continuar|começar outra|só na memória|só a extensão marca
TABLE

# The boot installs the rules in every container; IDEATION.md only in the
# ideation one (5kd.2.2). Driven rather than grepped: the real hook, the real
# documents, no mode set, a target that is its own mount.
boot="$ROOT/core/cont-init/50-agent-rules.sh"
b="$(mktemp -d)"; trap 'rm -rf "$b"' EXIT
mkdir -p "$b/rules"; printf 'tmpfs %s/rules tmpfs rw 0 0\n' "$b" > "$b/mounts"
env -u AGENT_CONTAINER_MODE AGENT_DOCS_DIR="$HERE/en" AGENT_RULES_DIR="$b/rules" AGENT_RULES_MOUNTS="$b/mounts" \
    bash "$boot" >/dev/null 2>&1 || true
check "the boot, with no mode, installs the development rules" "$(find "$b/rules" -name 'RULES.md' | wc -l | tr -d ' ')" "1"
check "  and not IDEATION.md" "$(find "$b/rules" -name 'IDEATION.md' | wc -l | tr -d ' ')" "0"
check "the index says what IDEATION.md is for" "$(yes_if "$(grep -c 'IDEATION.md' "$HERE/README.md" || true)")" "yes"

if [ "$failures" -gt 0 ]; then
    echo "ideation-rules.test: $failures failure(s)"
    exit 1
fi
echo "ideation-rules.test: the ideation container's rules say no code, one folder per idea under the contract, one conversation, consolidate before ready, and they stay out of projects, in both languages."
