#!/usr/bin/env bash
# Every test file in this repository has something in CI that runs it.
#
# **A dropped job does not fail — it reports nothing**, and a guard reporting
# nothing is indistinguishable from a guard that passes. That is the risk the
# move of this image's content actually carries: thirteen guards and each
# stack's in-image assertions exist because every one of them caught
# something, and losing one costs nothing today and everything on the day it
# would have fired.
#
# **Matching is by pattern, not by literal path, and that is the difficulty.**
# Searching the workflow for each test file's path reports three false
# absences: stacks/{cpp,php,python}/image.test.sh are reached as
# `stacks/${{ matrix.stack }}/image.test.sh` and do run. So each `${{ … }}`
# collapses to a `*` and the file is matched against the pattern.
#
# That glob **trusts something it does not itself check**: that the matrix
# covers every directory the glob matches. It holds because the stack list is
# read from the tree rather than written by hand — which is a separate
# assertion, in `discover-stacks`. Two assertions leaning on each other is
# fine; two each assuming the other is not, and the difference is that this
# says so.
#
# Usage: every-test-has-a-runner.test.sh [workflow] [list-file]
# MIN_TESTS floors the list length, because a guard that loops over nothing
# passes while proving nothing — and this is the guard the others are trusting.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="${1:-$ROOT/.github/workflows/ci.yml}"
LIST="${2:-}"
MIN_TESTS="${MIN_TESTS:-20}"
SELF="scripts/every-test-has-a-runner.test.sh"

if [ ! -f "$WORKFLOW" ]; then
    echo "every-test-has-a-runner: FAIL: no workflow at $WORKFLOW. A workflow that cannot be read \
is not a workflow with no runners in it, and reporting 'nothing runs anything' here would be a \
false alarm about every test at once." >&2
    exit 1
fi

if [ -n "$LIST" ]; then
    mapfile -t tests < "$LIST"
else
    mapfile -t tests < <(cd "$ROOT" && git ls-files | grep -E '\.test\.sh$' | sort)
fi
# A trailing empty line in a list file would otherwise be checked as a path.
filtered=()
for t in ${tests+"${tests[@]}"}; do [ -n "$t" ] && filtered+=("$t"); done
tests=(${filtered+"${filtered[@]}"})

if [ "${#tests[@]}" -lt "$MIN_TESTS" ]; then
    echo "every-test-has-a-runner: FAIL: found only ${#tests[@]} test file(s), expected at least \
$MIN_TESTS. This check is not reading the tree it thinks it is and would pass vacuously — which is \
worse than failing, because every other check here is trusting it." >&2
    exit 1
fi
echo "ok      ${#tests[@]} test file(s) to account for"

# Every path mentioned in a `run:` step, with each ${{ … }} collapsed to a
# glob. Deliberately crude: it over-matches rather than under-matches, because
# a false absence is what makes somebody stop reading a check.
mapfile -t patterns < <(
    grep -oE '[A-Za-z0-9_./-]*(\$\{\{[^}]*\}\}[A-Za-z0-9_./-]*)*\.test\.sh' "$WORKFLOW" \
        | sed -E 's/\$\{\{[^}]*\}\}/*/g' | sort -u
)
if [ "${#patterns[@]}" -eq 0 ]; then
    echo "every-test-has-a-runner: FAIL: $WORKFLOW mentions no test file at all. Either every job \
was dropped, or this check's own extraction stopped matching the way the workflow is written." >&2
    exit 1
fi
echo "ok      ${#patterns[@]} runner pattern(s) in $(basename "$WORKFLOW")"

# Said explicitly: a check that nothing runs is the joke this file would be
# telling. It is in the list above and so is covered by the loop — this asserts
# it was not filtered out of the list before the loop saw it.
case " ${tests[*]} " in
    *" $SELF "*) echo "ok      this guard is itself in the list it checks" ;;
    *)
        if [ -z "$LIST" ]; then
            echo "every-test-has-a-runner: FAIL: $SELF is not in the list of tests to account \
for. A guard exempt from its own rule is the one that goes unrun — or it is simply not committed \
yet, because the list comes from \`git ls-files\` rather than from the working tree." >&2
            exit 1
        fi
        ;;
esac

orphans=()
for t in "${tests[@]}"; do
    covered=no
    for p in "${patterns[@]}"; do
        # shellcheck disable=SC2254 -- $p is a glob on purpose.
        case "$t" in $p) covered=yes; break ;; esac
    done
    [ "$covered" = no ] && orphans+=("$t")
done

if [ "${#orphans[@]}" -gt 0 ]; then
    echo "every-test-has-a-runner: FAIL: ${#orphans[@]} of ${#tests[@]} test file(s) have nothing \
in $(basename "$WORKFLOW") that runs them. Each exists because it caught something, and a test \
nothing runs reports nothing rather than failing:" >&2
    printf '%s\n' "${orphans[@]}" | sed 's/^/        /' >&2
    exit 1
fi

echo
echo "every-test-has-a-runner.test: every test file has a runner."
