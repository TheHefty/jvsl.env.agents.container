#!/usr/bin/env bash
# The rules make an epic the merge gate for master (epic
# an-epic-reaches-master-whole): a task's pull request goes into
# story/<epic>/<story>, a story's into epic/<epic>. CI must run on those as on
# one into master, and today it does because `pull_request` carries no branch
# filter. This fails when that stops being true — a filter like the template's
# `branches: [master]` would leave every pull request into an epic or a story
# with no CI, and nothing would say so (story mdo.5, task mdo.5.1).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKFLOW="${CI_WORKFLOW_UNDER_TEST:-$HERE/../.github/workflows/ci.yml}"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}

# The `pull_request:` trigger's own block: from its line to the next key at the
# same or a lower indent.
block="$(awk '
    /^on:/ { on = 1; next }
    on && /^[^ #]/ { exit }
    on && /^  pull_request:/ { pr = 1; print; next }
    pr && /^  [^ ]/ { exit }
    pr { print }' "$WORKFLOW")"

check "ci.yml triggers on pull requests" "$([ -n "$block" ] && echo yes || echo no)" "yes"
# A filter that names branches must name all three bases; none at all covers them.
if grep -qE '^\s+(branches|branches-ignore):' <<<"$block"; then
    for base in master 'epic/\*\*' 'story/\*\*'; do
        check "the pull_request filter includes ${base//\\/}" "$(grep -cE "^\s+branches:.*${base}|^\s+- ['\"]?${base}['\"]?$" <<<"$block" | awk '{print ($1 > 0) ? "yes" : "no"}')" "yes"
    done
    check "and ignores none of them" "$(grep -cE 'branches-ignore' <<<"$block")" "0"
else
    echo "ok   the pull_request trigger has no branch filter, so it runs on master, epic/** and story/** alike"
fi

if [ "$failures" -gt 0 ]; then echo "ci-runs-on-epic-and-story-bases.test: $failures failure(s)"; exit 1; fi
echo "ci-runs-on-epic-and-story-bases.test: CI runs on pull requests into master, epic/** and story/**."
