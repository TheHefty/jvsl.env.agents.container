#!/usr/bin/env bash
# The three directories arrived whole.
#
# A git tree hash is content-addressed over the whole subtree: names, modes and
# every blob, recursively. Two trees with the same hash are byte-identical and
# there is nothing further to compare — which is why this asserts three hashes
# rather than enumerating paths and blobs as the task design proposed.
#
# It is also why this needs no network and keeps working after
# `jvsl.env.agents.code-server` is archived: the expected hashes *are* the
# content, recorded here rather than fetched.
#
# The failure it exists for is quiet. A dropped `cont-init` hook runs at
# container boot rather than at build time, and a `versions.json` is read only
# for the version a manifest selects — so the image still builds, and the gap
# surfaces the first time somebody picks the version nobody tried. A file count
# would match an empty file and a path list would match a truncated one.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# jvsl.env.agents.code-server at v5.0.0.
declare -A EXPECTED=(
    [core]=07f218dbe21da8f6527f93751d1cffabd631cf0a
    [stacks]=ada38b8750507f09a15392fd5b54d060ce28346b
    [scripts]=4f276b39869be459490878a0d451768863986f4a
)

merge=""
for c in $(git rev-list --merges HEAD); do
    p2="$(git rev-parse "$c^2" 2>/dev/null)" || continue
    git merge-base "$(git rev-parse "$c^1")" "$p2" >/dev/null 2>&1 || merge="$c"
done
if [ -z "$merge" ]; then
    echo "the-trees-match-the-template: FAIL: the content has not arrived — no merge of \
unrelated histories to check the trees of." >&2
    exit 1
fi

pass=0
fail=0
for dir in core stacks scripts; do
    want="${EXPECTED[$dir]}"
    got="$(git rev-parse "$merge:$dir" 2>/dev/null || true)"
    if [ "$got" = "$want" ]; then
        echo "ok      $dir/ is the template's at v5.0.0 ($want)"
        pass=$((pass + 1))
    else
        echo "the-trees-match-the-template: NOT OK: $dir/ differs from the template at v5.0.0.
        expected $want
        got      ${got:-<the directory is not in that commit at all>}
        A tree hash covers every name, mode and byte under it, so this says the subtree is not the \
one that was verified by the other repository's image builds." >&2
        fail=$((fail + 1))
    fi
done

echo
echo "the-trees-match-the-template.test: $pass passed, $fail failed."
[ "$fail" -eq 0 ]
