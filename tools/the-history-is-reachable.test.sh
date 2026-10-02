#!/usr/bin/env bash
# The reasons came with the files.
#
# This is the failure that looks like success: the merge commit is there, every
# file is correct, and `git log core/` shows one commit — because the
# resolution copied files in rather than taking their side. Bringing 86 commits
# was the whole argument for a merge over a copy, and nothing else here would
# notice their absence.
#
# It is also the only check that would notice a later rebase or squash
# flattening the merge away, which is exactly the change that leaves the files
# right and the reasons gone.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The template's first commit. Chosen because it is the one commit that can
# never be rewritten by anything upstream: it has no parent.
FIRST=0d871bf8b48c368ae9b747d9bbf484764bcf0673

pass=0
fail=0

if git merge-base --is-ancestor "$FIRST" HEAD 2>/dev/null; then
    echo "ok      the template's first commit is an ancestor ($(git log -1 --format='%s' "$FIRST"))"
    pass=$((pass + 1))
else
    echo "the-history-is-reachable: NOT OK: ${FIRST:0:8} is not an ancestor of HEAD. The content \
may be present while its history is not — which is a copy wearing a merge's clothes." >&2
    fail=$((fail + 1))
fi

# One file, exercised by name: the one whose every line has a reason recorded
# in a commit rather than in a comment.
n="$(git log --oneline -- core/Dockerfile.frag | wc -l | tr -d ' ')"
if [ "$n" -gt 1 ]; then
    echo "ok      git log reaches $n commits for core/Dockerfile.frag"
    pass=$((pass + 1))
else
    echo "the-history-is-reachable: NOT OK: git log shows $n commit(s) for \
core/Dockerfile.frag. The file is here and the reasons for it are not: the digest pin, the \
manual-page directory the base deletes, and the four libraries removed with the launcher each have \
their why in a commit message." >&2
    fail=$((fail + 1))
fi

echo
echo "the-history-is-reachable.test: $pass passed, $fail failed."
[ "$fail" -eq 0 ]
