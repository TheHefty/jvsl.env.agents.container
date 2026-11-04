#!/usr/bin/env bash
# Drives the pre-commit hook a project receives (assets/project/githooks-pre-commit;
# story the-markdown-size-check-runs-on-every-commit-in-a-project, task qws.1.1)
# through real `git commit`s in a throwaway repository, with check-md-size
# from core/bin standing in for the image's.
#
#   - a Markdown file over the limit stops the commit, naming it and the skill;
#   - failure 2: with check-md-size missing, the commit is refused and the hook
#     says so — a hook that passes without its check is the rule off, silently;
#   - a commit within the limit goes through.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/nobin"
cp "$ROOT/core/bin/check-md-size.sh" "$work/bin/check-md-size"; chmod +x "$work/bin/check-md-size"
repo="$work/repo"; git init -q "$repo"
mkdir -p "$repo/.githooks"; cp "$HERE/githooks-pre-commit" "$repo/.githooks/pre-commit"; chmod +x "$repo/.githooks/pre-commit"
git -C "$repo" config core.hooksPath .githooks
commit() { # <PATH> -> exit code; output in $work/out
    local code=0
    (cd "$repo" && PATH="$1" git -c user.email=t@t -c user.name=t commit -qm x) > "$work/out" 2>&1 || code=$?
    echo "$code"
}
base_path="$(dirname "$(command -v git)"):/usr/bin:/bin"

printf '# small\n' > "$repo/README.md"; git -C "$repo" add README.md
check "a commit within the limit goes through" "$(commit "$work/bin:$base_path")" "0"

python3 -I -c "print('x' * (51 * 1024))" > "$repo/docs.md"; git -C "$repo" add docs.md
code="$(commit "$work/bin:$base_path")"
check "a Markdown file over the limit stops the commit" "$code" "1"
check "naming the file and the skill that splits it" "$(grep -c 'docs.md' "$work/out") $(grep -c 'split-markdown' "$work/out")" "1 1"

git -C "$repo" rm -q --cached docs.md; rm "$repo/docs.md"; printf 'ok\n' > "$repo/b.md"; git -C "$repo" add b.md
code="$(commit "$work/nobin:$base_path")"
check "failure 2: without check-md-size the commit is refused" "$code" "1"
check "and the hook says what is missing and how to get it back" "$(grep -c 'check-md-size is not on PATH' "$work/out") $(grep -c -i 'rebuild' "$work/out")" "1 1"

if [ "$failures" -gt 0 ]; then
    echo "githooks-pre-commit.test: $failures failure(s)"
    exit 1
fi
echo "githooks-pre-commit.test: the project's hook refuses an oversized Markdown file and a missing check, and lets the rest through."
