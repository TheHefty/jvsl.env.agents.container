#!/usr/bin/env bash
# Drives the real changed-paths.sh in a real repository with the three levels of
# branch the rules name — master, epic/<epic>, story/<epic>/<story> — piping it
# into the real changed-scope.sh as CI does (story mdo.5, task mdo.5.1).
#
# Its three worst failures, each a case below:
#   1. the scope is read against master instead of the pull request's base: a
#      Markdown-only pull request into a story that is ahead of master in code
#      reads as full, and — the direction that ships something unbuilt — a code
#      change into a story could read as docs-only against the wrong ref;
#   2. the paths of a pull request into an epic are not the ones it changes;
#   3. a base that cannot be used — empty, the all-zero sha of a first push, a
#      sha the clone does not have — becomes an empty list or a silent pass,
#      when it must be "undetermined", which CI turns into a full build.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATHS="$HERE/changed-paths.sh"
SCOPE="$HERE/changed-scope.sh"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
r="$work/repo"
g() { git -C "$r" -c user.name=t -c user.email=t@t "$@"; }
commit() { mkdir -p "$r/$(dirname "$1")"; printf '%s\n' "$2" >> "$r/$1"; g add -A; g commit -qm "$1"; }

git init -q -b master "$r"
commit core/Dockerfile.frag 'FROM x'
commit docs/SRS/README.md '# SRS'
g branch -q epic/e
g switch -q -c story/e/s epic/e
commit core/cont-init/50-new.sh 'echo new'   # the story is ahead of master, in code
story_base="$(g rev-parse story/e/s)"
master_base="$(g rev-parse master)"

# Scope as CI computes it: the paths against a base, or full when undetermined.
scope_against() {
    local paths
    if paths="$(cd "$r" && bash "$PATHS" "$1" 2>/dev/null)"; then printf '%s\n' "$paths" | bash "$SCOPE"; else echo "undetermined:$?"; fi
}

# --- 1. a Markdown-only pull request into a story branch ------------------------

g switch -q -c task/docs story/e/s
commit docs/PLANNING/e/s/OVERVIEW.md 'the story'
check "against its story base, a docs-only pull request is docs-only" "$(scope_against "$story_base")" "docs-only"
check "the paths are the pull request's own" "$(cd "$r" && bash "$PATHS" "$story_base")" "docs/PLANNING/e/s/OVERVIEW.md"
check "against master the same change reads as full: the base is what decides" "$(scope_against "$master_base")" "full"

# --- 1, the other direction: a code change into a story branch --------------------

g switch -q -c task/code story/e/s
commit core/cont-init/50-new.sh 'echo more'
check "a code change into a story is full against its base" "$(scope_against "$story_base")" "full"

# --- 2. a pull request into an epic branch ----------------------------------------

g switch -q story/e/s
epic_base="$(g rev-parse epic/e)"
check "a story into its epic: the story's paths, against the epic" "$(cd "$r" && bash "$PATHS" "$epic_base")" "core/cont-init/50-new.sh"

# --- 3. a base that cannot be used is undetermined, never an empty list ------------

check "an empty base is undetermined" "$(scope_against "")" "undetermined:3"
check "the all-zero sha of a first push is undetermined" "$(scope_against 0000000000000000000000000000000000000000)" "undetermined:3"
check "a sha the clone does not have is undetermined" "$(scope_against 1234567890abcdef1234567890abcdef12345678)" "undetermined:3"
(cd "$r" && bash "$PATHS" "" 2>"$work/err" >/dev/null) || true
check "and says why, on stderr" "$(grep -c 'no usable base' "$work/err")" "1"

if [ "$failures" -gt 0 ]; then echo "changed-paths.test: $failures failure(s)"; exit 1; fi
echo "changed-paths.test: the paths are read against the pull request's own base, master, epic or story, and a base that cannot be used is undetermined."
