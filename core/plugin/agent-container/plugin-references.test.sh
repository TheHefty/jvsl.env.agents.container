#!/usr/bin/env bash
# Holds the plugin's skills to the scripts they call, and the ceremonies to
# their names (task the-daily-is-called-planning-everywhere).
#
# A skill names its scripts as ${CLAUDE_PLUGIN_ROOT}/bin/<script>, in prose the
# agent follows. A script renamed or removed under it does not fail anything:
# the agent runs a command that does not exist, mid-ceremony, and improvises.
# And a ceremony's old name left behind does not fail either — it confuses,
# which is what the epic `the rename left things behind` was about. "Daily" was
# renamed "planning" on 2026-10-28; this keeps it from coming back.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"

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

for skill in "$HERE"/skills/*/SKILL.md; do
    name="$(basename "$(dirname "$skill")")"
    while IFS= read -r script; do
        check "$name calls bin/$script, which exists and runs" \
            "$([ -x "$HERE/bin/$script" ] && echo yes || echo "no: $HERE/bin/$script")" "yes"
    done < <(grep -oE '\$\{CLAUDE_PLUGIN_ROOT\}/bin/[A-Za-z0-9_-]+' "$skill" | sed 's|.*/bin/||' | sort -u)
done

# Where the ceremony's name is read: the plugin, the normative documents, the
# image's assertions and CI's step names. The SRS keeps the word in the dated
# amendment that records the rename, and the CHANGELOG is history.
left="$(cd "$ROOT" && grep -rniE '\bdaily' core/plugin docs/agent core/image.test.sh .github/workflows/ci.yml \
    --exclude=plugin-references.test.sh || true)"
check "nothing still calls the planning a daily" "$left" ""

if [ "$failures" -gt 0 ]; then
    echo "plugin-references.test: $failures failure(s)"
    exit 1
fi
echo "plugin-references.test: every script a skill calls exists, and the planning is called planning everywhere it is read."
