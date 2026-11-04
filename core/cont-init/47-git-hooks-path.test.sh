#!/usr/bin/env bash
# Exercises 47-git-hooks-path.sh, the real script, on throwaway repositories
# (story the-markdown-size-check-runs-on-every-commit-in-a-project, task
# qws.1.1): the container points the project's git at .githooks, and nothing
# else.
#
#   - failure 1: a hooks path somebody chose — in the project or globally — is
#     never replaced;
#   - nothing is turned on for a project with no hook;
#   - failure 3: our hook made executable, since a file written through the
#     editor's host may arrive without its bit; a CRLF copy said, not run.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/47-git-hooks-path.sh"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
OURS='#!/bin/sh
# jvsl.env.agents.container: generated. Do not edit.
check-md-size'
fresh() { rm -rf "$work/ws" "$work/gitconfig"; git init -q "$work/ws"; : > "$work/gitconfig"; }
boot() { WORKSPACE="$work/ws" GITCONFIG="$work/gitconfig" GIT_OWNER=nobody-here bash "$SCRIPT" > "$work/out" 2>&1; echo $?; }
hookspath() { git config --file "$work/ws/.git/config" --get core.hooksPath || true; }

fresh; mkdir -p "$work/ws/.githooks"; printf '%s\n' "$OURS" > "$work/ws/.githooks/pre-commit"; chmod 644 "$work/ws/.githooks/pre-commit"
check "the boot never fails the container" "$(boot)" "0"
check "with the hook there and nothing set, git is pointed at .githooks" "$(hookspath)" ".githooks"
check "failure 3: our hook is made executable" "$(test -x "$work/ws/.githooks/pre-commit" && echo yes || echo no)" "yes"
check "and a second boot changes nothing" "$(boot) $(hookspath) $(grep -c . "$work/out" || true)" "0 .githooks 0"

fresh; mkdir -p "$work/ws/.githooks"; printf '%s\n' "$OURS" > "$work/ws/.githooks/pre-commit"
git config --file "$work/ws/.git/config" core.hooksPath .husky
check "failure 1: a hooks path set in the project is kept" "$(boot) $(hookspath)" "0 .husky"
check "and the boot says so once, naming it" "$(grep -c '.husky' "$work/out")" "1"

fresh; mkdir -p "$work/ws/.githooks"; printf '%s\n' "$OURS" > "$work/ws/.githooks/pre-commit"
git config --file "$work/gitconfig" core.hooksPath /somewhere/hooks
check "failure 1: a hooks path set globally is kept too" "$(boot) $(hookspath)" "0 "

fresh
check "a project with no hook gets nothing" "$(boot) $(hookspath) $(grep -c . "$work/out" || true)" "0  0"

fresh; mkdir -p "$work/ws/.githooks"; printf '%s\r\n' '#!/bin/sh' '# jvsl.env.agents.container: generated. Do not edit.' 'check-md-size' > "$work/ws/.githooks/pre-commit"
boot >/dev/null
check "failure 3: a CRLF copy is said, with the fix" "$(grep -c 'CRLF' "$work/out") $(grep -c 'gitattributes\|eol=lf' "$work/out")" "1 1"

fresh; printf 'gitdir: /elsewhere\n' > "$work/ws/.git.tmp"; rm -rf "$work/ws/.git"; mv "$work/ws/.git.tmp" "$work/ws/.git"; mkdir -p "$work/ws/.githooks"; printf '%s\n' "$OURS" > "$work/ws/.githooks/pre-commit"
check "a workspace whose .git is not a directory is left alone, and says so" "$(boot) $(grep -c 'not a directory' "$work/out")" "0 1"

if [ "$failures" -gt 0 ]; then
    echo "47-git-hooks-path.test: $failures failure(s)"
    exit 1
fi
echo "47-git-hooks-path.test: the project's git runs .githooks when it has one and nothing else was chosen."
