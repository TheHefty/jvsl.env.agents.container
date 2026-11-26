#!/usr/bin/env bash
# changed-paths.sh <base-sha>: prints the paths changed between that base and
# HEAD, one per line, for changed-scope.sh and declares-extensions.sh to read.
#
# **The base is the pull request's own** (story mdo.5, task mdo.5.1): master,
# epic/<epic> or story/<epic>/<story>, whichever it targets — CI passes
# github.event.pull_request.base.sha, or a push's `before`. Compared against
# master instead, a Markdown-only pull request into a story that is ahead of
# master in code would build everything, and a code change could read as
# documentation against a ref that already holds it.
#
# **Exit 3 when the base cannot be used** — empty, the all-zero sha a branch's
# first push carries, a sha this clone does not have — with the reason on
# stderr. Never an empty list: an empty list reads as "nothing changed", and an
# undetermined scope is a reason to build, not to skip.
set -uo pipefail

base="${1:-}"
if [ -z "$base" ] || [ "$base" = 0000000000000000000000000000000000000000 ]; then
    echo "changed-paths: no usable base ref (got '${base}'), so the changed paths are undetermined" >&2
    exit 3
fi
if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
    echo "changed-paths: no usable base ref: $base is not a commit in this clone (a shallow checkout, or a force-pushed base), so the changed paths are undetermined" >&2
    exit 3
fi
if ! git diff --name-only "$base" HEAD; then
    echo "changed-paths: git diff against $base failed, so the changed paths are undetermined" >&2
    exit 3
fi
