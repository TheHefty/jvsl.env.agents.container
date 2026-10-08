#!/usr/bin/env bash
# Every source and every test under src/ is read by what is meant to read it,
# wherever in src/ it sits.
#
# **A check that stops reading a file stays green.** Measured on 2026-10-08,
# before src/ was split into folders (story the-commands-leave-the-hub):
# `git ls-files 'src/*.ts'` sees subfolders, because git's `*` crosses `/`; a
# shell's `ls src/*.ts` does not, and neither does `node --test 'src/*.test.ts'`,
# which is what `npm test` ran. A test moved into a folder would have stopped
# running with every job green.
#
# Three claims:
#   1. the test runner's glob reaches a test in a subfolder, and every test file
#      git knows under src/ is one it runs;
#   2. no guard lists the extension's source with a shell glob;
#   3. nothing under src/ imports src/extension.ts, whose registrations must run
#      before anything they import is evaluated: a cycle back into it leaves a
#      command undefined in the bundle, the "Activating…" class of failure.
#
# EVERY_SOURCE_ROOT points this at another tree, which is how each claim is
# shown to fail.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${EVERY_SOURCE_ROOT:-$(cd "$HERE/.." && pwd)}"
cd "$ROOT"

failures=0
fail() { echo "every-source-is-read: FAIL: $*" >&2; failures=$((failures + 1)); }

# --- 1. the runner reaches every test ----------------------------------------

# The globs `npm test` hands to node --test, read from package.json rather than
# copied here, so a change to the script is what this checks.
mapfile -t globs < <(node -e '
    const s = require("./package.json").scripts.test || ""
    for (const m of s.matchAll(/'"'"'([^'"'"']+)'"'"'/g)) console.log(m[1])')
[ "${#globs[@]}" -gt 0 ] || fail "package.json's test script names no quoted glob; this check cannot tell what it runs"

# node's own glob, the one node --test uses, against a tree with a test one
# folder down. A glob that misses it misses every test moved into a folder.
probe="$(mktemp -d)"
trap 'rm -rf "$probe"' EXIT
mkdir -p "$probe/src/a-folder"
touch "$probe/src/a-folder/moved.test.ts" "$probe/src/top.test.ts"
reached="$(cd "$probe" && node -e '
    const { globSync } = require("node:fs")
    const out = new Set()
    for (const g of process.argv.slice(1)) for (const f of globSync(g)) out.add(f)
    console.log([...out].sort().join("\n"))' "${globs[@]}" 2>/dev/null || true)"
case "$reached" in
    *src/a-folder/moved.test.ts*) ;;
    *) fail "npm test's glob (${globs[*]}) does not reach src/a-folder/moved.test.ts: a test moved into \
a folder would stop running, and every job would stay green" ;;
esac

# And every test file git knows under src/ is one of them.
mapfile -t tests < <(git ls-files 'src/*.test.ts')
ran="$(node -e '
    const { globSync } = require("node:fs")
    const out = new Set()
    for (const g of process.argv.slice(1)) for (const f of globSync(g)) out.add(f)
    console.log([...out].join("\n"))' "${globs[@]}" 2>/dev/null || true)"
for t in "${tests[@]}"; do
    printf '%s\n' "$ran" | grep -qxF -- "$t" || fail "$t is a test npm test never runs"
done

# --- 2. no guard lists the source with a shell glob --------------------------

# `ls src/…` and a bare `src/*.ts` handed to a shell stop at the first level.
# git ls-files is the form that does not.
while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    fail "${hit%%:*} lists the extension's source with a shell glob, which does not see subfolders: \
$(printf '%s' "$hit" | cut -d: -f2-). Use git ls-files 'src/…'"
done < <(grep -nE '(^|[[:space:](])ls[[:space:]][^|#]*src/' scripts/*.sh 2>/dev/null | grep -v "^scripts/every-source-is-read.test.sh:" || true)

# --- 3. nothing imports the entry point --------------------------------------

while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    fail "${hit%%:*} imports src/extension.ts. The entry point imports the commands, never the other \
way: a cycle leaves a registration undefined in the bundle"
done < <(git ls-files 'src/*.ts' | grep -vxF src/extension.ts \
    | xargs -r grep -nE "from '(\./|(\.\./)+)extension(\.ts)?'" 2>/dev/null || true)

echo
if [ "$failures" -eq 0 ]; then
    echo "every-source-is-read.test: npm test reaches every test under src/ (${#tests[@]}), no guard reads \
the source with a shell glob, and nothing imports the entry point."
else
    echo "every-source-is-read.test: $failures failure(s)." >&2
    exit 1
fi
