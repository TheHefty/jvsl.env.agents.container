#!/usr/bin/env bash
# A project's own rules live in docs/RULES.md, the agent writes it at
# initialization, and nothing shipped still describes the import that is gone.
#
# Story the-agent-writes-the-projects-rules. Measured on 2026-10-15: nothing
# created docs/RULES.md; INITIALIZATION.md, RULES.md and this folder's README
# still told the agent to import the inherited rules from
# .code-server/docs/agent/, which no project has any more (they arrive at
# ~/.claude/rules with the image); and the CLAUDE.md a project is given named
# neither docs/RULES.md nor where INITIALIZATION.md is.
#
# Its three failure scenarios:
#   1. the agent is still told to write an import that resolves to nothing;
#   2. one language says to write docs/RULES.md and the other does not;
#   3. docs/RULES.md is read as the place for the inherited rules, and they are
#      copied into it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

failures=0
fail() { echo "project-rules: FAIL: $*" >&2; failures=$((failures + 1)); }
ok() { echo "ok      $*"; }

# --- 1. nothing shipped describes the import that is gone ---------------------

stale="$(grep -rn -i -E '\.code-server/docs/agent|import line|linha de import|imports this file|importa este arquivo|^@' \
    "$HERE"/README.md "$HERE"/en "$HERE"/pt-BR 2>/dev/null || true)"
if [ -n "$stale" ]; then
    fail "these still describe importing the inherited rules, which no project does any more:"
    printf '        %s\n' "$stale" | cut -c1-200 >&2
else
    ok "no shipped document describes the import from .code-server/docs/agent/"
fi

# --- 2. both languages tell the agent to write docs/RULES.md ------------------

for lang in en pt-BR; do
    init="$HERE/$lang/INITIALIZATION.md"
    grep -q 'docs/RULES.md' "$init" && grep -q 'docs/CHARTER.md' "$init" \
        || fail "$lang/INITIALIZATION.md does not name docs/RULES.md beside the charter"
    grep -q '[~]/[.]claude/rules' "$init" \
        || fail "$lang/INITIALIZATION.md does not say the inherited rules are at ~/.claude/rules"
done
ok "both languages' INITIALIZATION.md were read for docs/RULES.md and ~/.claude/rules"

# --- 3. docs/RULES.md holds only the project's own ----------------------------

for lang in en pt-BR; do
    head -14 "$HERE/$lang/RULES.md" | grep -q '[~]/[.]claude/rules' \
        || fail "$lang/RULES.md's opening does not say the inherited rules arrive at ~/.claude/rules"
done
ok "both languages' RULES.md say where the inherited rules are"

# --- the CLAUDE.md a project is given -----------------------------------------
#
# What makes the two above reachable: the agent loads the project's own rules
# every session, and knows where the documents read on demand live.

claude="$ROOT/assets/project/CLAUDE.md"
grep -qx '@docs/RULES.md' "$claude" \
    || fail "the generated CLAUDE.md does not import @docs/RULES.md, so the project's own rules are never loaded"
grep -q '/opt/jvsl/docs/agent/' "$claude" \
    || fail "the generated CLAUDE.md does not say where INITIALIZATION.md and WORKFLOW.md are (/opt/jvsl/docs/agent/)"
ok "the generated CLAUDE.md was read for @docs/RULES.md and /opt/jvsl/docs/agent/"

echo
if [ "$failures" -eq 0 ]; then
    echo "project-rules.test: a project's own rules have a home, and nothing points at the import that is gone."
else
    echo "project-rules.test: $failures failure(s)." >&2
    exit 1
fi
