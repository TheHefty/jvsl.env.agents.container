#!/usr/bin/env bash
# The lint reads every file it is meant to, and not one fewer.
#
# **A lint that skips a file reports that file clean.** It is the same class as
# scripts/every-source-is-read.test.sh: a glob that misses a folder, or a shell
# script with no extension, passes every run and checks nothing. So the files
# each linter reads are compared with what git tracks, worked out here by a
# different route than the linters' own: every tracked file is opened, and a
# shell script is one that ends in .sh or starts with a sh or bash shebang.
#
# Story lint-and-hooks-guard-every-change.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT"

failures=0
fail() { echo "lint-covers-everything: FAIL: $*" >&2; failures=$((failures + 1)); }

# --- the shell ---------------------------------------------------------------

expected_shell="$(git ls-files -z | while IFS= read -r -d '' f; do
    [ -f "$f" ] || continue
    case "${f##*/}" in
        *.sh) echo "$f" ;;
        *.*) ;;
        *) head -c 64 "$f" 2>/dev/null | head -1 | grep -qE '^#!.*\b(ba)?sh\b' && echo "$f" ;;
    esac
done | sort -u)"
[ -n "$expected_shell" ] || fail "found no shell script at all, which cannot be true here; the search is broken"

listed_shell="$(bash scripts/lint-shell.sh --list | sort -u)"
missing="$(comm -23 <(printf '%s\n' "$expected_shell") <(printf '%s\n' "$listed_shell"))"
[ -z "$missing" ] || fail "shellcheck never reads these shell scripts: $(printf '%s ' $missing)"
echo "ok      shellcheck reads all $(printf '%s\n' "$expected_shell" | wc -l) shell scripts"

# --- the TypeScript and JavaScript --------------------------------------------

expected_js="$(git ls-files '*.ts' '*.mjs' '*.js' '*.cjs' | sort -u)"
linted_js="$(npx --no-install eslint --format json . 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s))console.log(require("path").relative(process.cwd(),r.filePath))})' \
    | sort -u || true)"
[ -n "$linted_js" ] || fail "ESLint reported no file at all; it is not reading this tree"
missing="$(comm -23 <(printf '%s\n' "$expected_js") <(printf '%s\n' "$linted_js"))"
[ -z "$missing" ] || fail "ESLint never reads these: $(printf '%s ' $missing)"
echo "ok      ESLint reads all $(printf '%s\n' "$expected_js" | wc -l) TypeScript and JavaScript files"

echo
if [ "$failures" -eq 0 ]; then
    echo "lint-covers-everything.test: both linters read every file they are meant to."
else
    echo "lint-covers-everything.test: $failures failure(s)." >&2
    exit 1
fi
