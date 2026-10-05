#!/usr/bin/env bash
# Every job in ci.yml either consults the change's scope or is written down as
# one that must run anyway.
#
# **A Markdown change used to run twenty-seven of thirty-six checks.**
# `scripts/changed-scope.sh` was correct and four jobs consulted it; the other
# twenty-four ran unconditionally, and nothing said so. It did not surface as
# slowness — it surfaced when three runs died waiting for runners and the pull
# request that could not get through was documentation only.
#
# **An allowlist rather than a count.** A count passes while the wrong job is on
# the wrong side of it, and the next job added inherits whatever its author
# assumed. A name on this list is a decision somebody made; a number is not.
#
# See docs/DEBTS/a-markdown-change-runs-the-whole-suite/.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${SCOPE_GUARD_ROOT:-$(cd "$HERE/.." && pwd)}"
cd "$ROOT"

WORKFLOW="${SCOPE_GUARD_WORKFLOW:-.github/workflows/ci.yml}"

# Jobs that run however small the change is, each because of what it checks.
#
#   changes     computes the scope, so it cannot depend on it
#   md-size     the 50 KiB rule is about Markdown files
#   agent-docs  the two language folders are checked against each other
#   ci-scripts  carries agent-docs-cite-real-files.test.sh, which fails when a
#               normative document cites a path that does not exist
#   ci-green    the gate, which must report on whatever ran
ALWAYS=(changes md-size agent-docs ci-scripts ci-green)

[ -f "$WORKFLOW" ] || {
    echo "every-job-respects-the-scope: FAIL: no $WORKFLOW to read." >&2
    exit 1
}

# Job names are the keys at two spaces of indentation under `jobs:`.
mapfile -t jobs < <(awk '/^jobs:/{inj=1;next} inj && /^  [a-z][a-z0-9-]*:$/{gsub(/[ :]/,"");print}' "$WORKFLOW")

if [ "${#jobs[@]}" -lt 10 ]; then
    echo "every-job-respects-the-scope: FAIL: found only ${#jobs[@]} job(s) in $WORKFLOW; this \
check is not reading what it thinks it is and would pass vacuously." >&2
    exit 1
fi
echo "ok      ${#jobs[@]} job(s) declared"

# The mechanism must find a guard that is really there, or its silence is empty.
grep -q 'needs.changes.outputs.scope' "$WORKFLOW" || {
    echo "every-job-respects-the-scope: FAIL: no job consults \
needs.changes.outputs.scope anywhere, which cannot be true while the scope is computed. The \
mechanism is broken and the assertion below proves nothing." >&2
    exit 1
}
echo "ok      the search mechanism finds a scope guard that is really there"

in_list() { local n="$1"; shift; local x; for x in "$@"; do [ "$x" = "$n" ] && return 0; done; return 1; }

# **No job declares the same key twice**, which is the mistake this guard was
# extended for. Adding `if:` to a job that already had one produced a duplicate
# key; GitHub refused the whole workflow with "This run likely failed because of
# a workflow file issue" and *no jobs at all* — so there was nothing to read, and
# the first version of this guard passed because the string it looked for was
# present twice rather than once.
#
# Text rather than a parser on purpose: this runs on a checkout with no
# dependencies installed, and the defect is visible without understanding YAML.
dupes="$(awk '
    /^  [a-z][a-z0-9-]*:$/ { job = $0; gsub(/[ :]/, "", job); delete seen; next }
    job != "" && match($0, /^    [a-z-]+:/) {
        key = substr($0, RSTART + 4, RLENGTH - 5)
        if (seen[key]++) print job "." key
    }
' "$WORKFLOW" | sort -u)"
if [ -n "$dupes" ]; then
    echo "every-job-respects-the-scope: FAIL: these jobs declare the same key twice. The workflow \
is invalid YAML, and GitHub rejects it before running anything — so no job reports a failure and \
nothing says why:" >&2
    printf '        %s\n' $dupes >&2
    exit 1
fi
echo "ok      no job declares the same key twice"

# Each job's own block, from its key to the next one at the same indentation.
unguarded=()
for job in "${jobs[@]}"; do
    in_list "$job" "${ALWAYS[@]}" && continue
    block="$(awk -v j="  $job:" '
        $0 == j {inb=1; next}
        inb && /^  [a-z][a-z0-9-]*:$/ {exit}
        inb {print}
    ' "$WORKFLOW")"
    printf '%s' "$block" | grep -q 'needs.changes.outputs.scope' || unguarded+=("$job")
done

if [ "${#unguarded[@]}" -gt 0 ]; then
    echo "every-job-respects-the-scope: FAIL: ${#unguarded[@]} job(s) run however small the change \
is, and are not written down as having to. A documentation pull request asks for a runner for each \
of them:" >&2
    printf '        %s\n' "${unguarded[@]}" >&2
    echo "        Add 'if: needs.changes.outputs.scope != '\''docs-only'\''' to each, or add it to \
ALWAYS in this file with the reason it has to run." >&2
    exit 1
fi
echo "ok      every other job consults the scope"

echo
echo "every-job-respects-the-scope.test: 4 passed, 0 failed."
