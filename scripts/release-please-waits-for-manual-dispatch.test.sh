#!/usr/bin/env bash
# Release-please is operator-driven: an ordinary merge must not propose a
# release, and a manual cut must run against master only.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workflow="$ROOT/.github/workflows/release-please.yml"
package_workflow="$ROOT/.github/workflows/release-package.yml"

pass=0
fail=0
check() {
    if [ "$2" = "$3" ]; then
        echo "ok   $1"
        pass=$((pass + 1))
    else
        echo "FAIL $1"
        echo "     expected: $3"
        echo "     got:      $2"
        fail=$((fail + 1))
    fi
}

events="$(awk '
    /^on:$/ { in_events = 1; next }
    in_events && /^[^[:space:]]/ { exit }
    in_events && /^  [A-Za-z_-]+:$/ { sub(/^  /, ""); sub(/:$/, ""); print }
' "$workflow")"
check "workflow_dispatch is the only release-please trigger" "$events" "workflow_dispatch"
check "the release job is restricted to master" \
    "$(grep -cF "if: github.ref == 'refs/heads/master'" "$workflow" || true)" "1"
check "release-please still targets master" \
    "$(grep -cF 'target-branch: master' "$workflow" || true)" "1"
check "release-package still runs only for a published release" \
    "$(grep -cF 'types: [published]' "$package_workflow" || true)" "1"

for lang in en pt-BR; do
    rules="$ROOT/docs/agent/$lang/RULES.md"
    workflow_doc="$ROOT/docs/agent/$lang/WORKFLOW.md"
    case "$lang" in
        en)
            rules_marker='manually dispatches'
            workflow_marker='first dispatch'
            ;;
        pt-BR)
            rules_marker='manualmente'
            workflow_marker='primeiro disparo'
            ;;
    esac
    check "$lang RULES explains the manual release gate" \
        "$(grep -icF "$rules_marker" "$rules" || true)" "1"
    check "$lang WORKFLOW explains the two dispatches" \
        "$(grep -icF "$workflow_marker" "$workflow_doc" || true)" "1"
done

echo
echo "release-please-waits-for-manual-dispatch.test: $pass passed, $fail failed."
[ "$fail" -eq 0 ]
