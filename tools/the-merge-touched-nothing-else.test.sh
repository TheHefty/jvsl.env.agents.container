#!/usr/bin/env bash
# The merge that brought the image's content changed nothing else.
#
# `git merge --allow-unrelated-histories` touches every path in principle: the
# other side has a `README.md`, a `LICENSE`, a `.gitignore`, two release-please
# files and — the one that matters — a `.github/workflows/ci.yml` of its own.
#
# **That workflow also defines a job named `ci-green`**, which is this
# repository's one required check. Had the merge taken the template's side
# there, `typecheck`, `unit`, `package` and `integration` would be gone, branch
# protection would still find a `ci-green`, and every pull request would keep
# reporting mergeable while nothing tested the extension. Nothing would say so.
#
# This asserts about one historical commit, so it stays true for ever rather
# than drifting as the extension changes. The commit is found rather than
# pinned: a merge whose parents share no ancestor is unique here, and finding
# it means no SHA has to be written down and kept correct.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

KEEP_OUT=(':(exclude)core' ':(exclude)stacks' ':(exclude)scripts')

merges=()
for c in $(git rev-list --merges HEAD); do
    p1="$(git rev-parse "$c^1")"
    p2="$(git rev-parse "$c^2" 2>/dev/null)" || continue
    # Exits non-zero when the two share no ancestor, which is what an
    # unrelated-histories merge is and what no ordinary merge here can be.
    if ! git merge-base "$p1" "$p2" >/dev/null 2>&1; then
        merges+=("$c")
    fi
done

if [ "${#merges[@]}" -eq 0 ]; then
    echo "the-merge-touched-nothing-else: FAIL: no merge of unrelated histories in this \
repository's history. The image's content has not arrived, or it arrived as a copy rather than as \
a merge — which is the one outcome this task exists to avoid, because a copy brings no history." >&2
    exit 1
fi
if [ "${#merges[@]}" -gt 1 ]; then
    echo "the-merge-touched-nothing-else: FAIL: ${#merges[@]} merges of unrelated histories, \
expected exactly one: ${merges[*]}" >&2
    exit 1
fi

merge="${merges[0]}"
echo "ok      one merge of unrelated histories: $(git log -1 --format='%h %s' "$merge")"

changed="$(git diff --name-only "$merge^1" "$merge" -- . "${KEEP_OUT[@]}")"
if [ -n "$changed" ]; then
    echo "the-merge-touched-nothing-else: FAIL: the merge changed files outside core/, stacks/ \
and scripts/. Everything below was this repository's own and the merge was supposed to keep it:" >&2
    printf '%s\n' "$changed" | sed 's/^/        /' >&2
    exit 1
fi
echo "ok      it changed nothing outside core/, stacks/ and scripts/"

# Said explicitly rather than left to the blanket assertion above, because this
# is the file whose silent replacement would look like success.
if git diff --name-only "$merge^1" "$merge" -- .github/workflows/ci.yml | grep -q .; then
    echo "the-merge-touched-nothing-else: FAIL: the merge touched .github/workflows/ci.yml" >&2
    exit 1
fi
echo "ok      .github/workflows/ci.yml is untouched by it"

echo
echo "the-merge-touched-nothing-else.test: 3 passed, 0 failed."
