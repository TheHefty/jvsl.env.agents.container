#!/usr/bin/env bash
# The practice left the study on 2026-10-28 (task the-practice-leaves-the-study):
# a topic is its guide alone. A reference left behind does not fail — a skill
# telling the agent to write practice.json, a checker refusing a topic without
# one, a page offering to save an attempt — it misleads, which is the lesson of
# the epic `the rename left things behind`. This keeps it from coming back
# where it would be read: the plugin and the Study view.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${PRACTICE_GUARD_ROOT:-$(cd "$HERE/.." && pwd)}"
cd "$ROOT"

# Tests are not checked: the ones that name practice.json and attempts.json do
# so to prove a topic built before the change still opens with them ignored.
mapfile -t files < <(git ls-files 'core/plugin/agent-container/*' 'src/study/*' | grep -v '/example/' | grep -vE '\.test\.(ts|sh)$' | sort -u)
if [ "${#files[@]}" -lt 5 ]; then
    echo "the-practice-is-gone: FAIL: found ${#files[@]} file(s) to check; this guard is not reading the tree it thinks it is." >&2
    exit 1
fi

left="$(grep -nE 'practice\.json|attempts\.json|[Ss]ave (an(other)? )?attempt|practice\.schema|attempts\.schema' "${files[@]}" || true)"
if [ -n "$left" ]; then
    echo "the-practice-is-gone: FAIL: the practice is still referred to where the study is built or shown:" >&2
    printf '        %s\n' "$left" >&2
    exit 1
fi
echo "ok      ${#files[@]} file(s) of the plugin and the Study view name no practice and no attempts"
echo
echo "the-practice-is-gone.test: 1 passed, 0 failed."
