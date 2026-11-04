#!/usr/bin/env bash
# The initialization writes docs/ARCHITECTURE.md beside the charter and the SRS,
# and a task that changes the shape keeps it true (story
# the-initialization-produces-the-architecture-document, epic 2mq). Asked for by
# the operator on 2026-11-04: a living document, not a gate.
#
# docs/agent/<lang>/ARCHITECTURE.md was the instruction for a
# docs/ARCHITECTURE/OVERVIEW.md that no flow asked for, and it still pointed at
# the template's .code-server/docs/overview/ and at docs/PLANNING/. The ways it
# fails, checked here, in both languages:
#
#   - **the flow never names it**, so the agent never writes it.
#   - **the instruction names another file, or a path that is gone.**
#   - **nothing keeps it true**: no rule ties a change of shape to it.
#   - **the languages drift** — parity sees headings; this sees the names.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}
has() { grep -cF -- "$2" "$1" 2>/dev/null || true; }
nonzero() { [ "$1" -gt 0 ] && echo yes || echo no; }

for lang in en pt-BR; do
    d="$HERE/$lang"
    check "$lang: the initialization names docs/ARCHITECTURE.md" "$(nonzero "$(has "$d/INITIALIZATION.md" 'docs/ARCHITECTURE.md')")" "yes"
    check "$lang: the instruction is for docs/ARCHITECTURE.md" "$(nonzero "$(has "$d/ARCHITECTURE.md" 'docs/ARCHITECTURE.md')")" "yes"
    check "$lang: and not for docs/ARCHITECTURE/OVERVIEW.md" "$(has "$d/ARCHITECTURE.md" 'docs/ARCHITECTURE/OVERVIEW.md')" "0"
    check "$lang: the instruction names no path of the legacy template" \
        "$(has "$d/ARCHITECTURE.md" '.code-server/') $(has "$d/ARCHITECTURE.md" 'docs/PLANNING')" "0 0"
    check "$lang: a task that changes the shape updates it, in the workflow or the tasks" \
        "$(nonzero "$(( $(has "$d/WORKFLOW.md" 'docs/ARCHITECTURE.md') + $(has "$d/TASKS.md" 'docs/ARCHITECTURE.md') ))")" "yes"
done

if [ "$failures" -gt 0 ]; then
    echo "architecture-document.test: $failures failure(s)"
    exit 1
fi
echo "architecture-document.test: the initialization writes docs/ARCHITECTURE.md, the instruction names it, and a change of shape keeps it true, in both languages."
