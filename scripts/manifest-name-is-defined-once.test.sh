#!/usr/bin/env bash
# The project manifest's name is written out once in the source, and the
# activation event agrees with it.
#
# **A name in several places is how a rename leaves one behind.** The rename
# this guard was written for touched forty-nine occurrences across twenty-nine
# files; three source files spelled the name out while a constant for it already
# existed, unexported, in a fourth. A sweep that misses one leaves a path looking
# for a file nobody writes any more — and nothing fails, which is the whole
# failure mode of the epic this belongs to.
#
# **`package.json` is the one place the literal must survive.** Activation is
# data: the editor reads `workspaceContains:` before any of this extension's code
# runs, so the name cannot be a variable there. It therefore exists twice by
# necessity, and the two agreeing is something to check rather than assume — the
# same shape as scripts/command-names-are-current.test.sh, which takes its truth
# from the manifest and holds the source to it.
#
# Comments are excluded for the reason the submodule guard gives: a grep cannot
# tell a recollection from an instruction, and these files are expected to record
# what the file used to be called.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${MANIFEST_NAME_GUARD_ROOT:-$(cd "$HERE/.." && pwd)}"
cd "$ROOT"

DEF_FILE="src/shared/stack-manifest.ts"

mapfile -t sources < <(git ls-files 'src/*.ts' 'tools/*.ts' | grep -vE '\.test\.ts$' | sort)

# The floor. A loop over nothing passes while proving nothing.
if [ "${#sources[@]}" -lt 5 ]; then
    echo "manifest-name-is-defined-once: FAIL: found only ${#sources[@]} source file(s); this \
check is not reading the tree it thinks it is and would pass vacuously." >&2
    exit 1
fi
echo "ok      ${#sources[@]} source file(s) to check"

[ -f "$DEF_FILE" ] || {
    echo "manifest-name-is-defined-once: FAIL: $DEF_FILE does not exist, so there is no single \
definition for anything to refer to." >&2
    exit 1
}

# The name, taken from its definition rather than written here, so this guard
# survives the rename it exists for.
name="$(grep -oE "export const MANIFEST = '[^']+'" "$DEF_FILE" | head -1 | sed -E "s/.*'([^']+)'.*/\1/")"
if [ -z "$name" ]; then
    echo "manifest-name-is-defined-once: FAIL: $DEF_FILE declares no \`export const MANIFEST = \
'…'\`, so there is nothing to hold the rest of the source to." >&2
    exit 1
fi
echo "ok      the name is defined once, in $DEF_FILE, as '$name'"

# The mechanism must find the string somewhere it really is, or its silence
# means nothing.
grep -qF "$name" package.json || {
    echo "manifest-name-is-defined-once: FAIL: '$name' appears nowhere in package.json, which \
cannot be true while activation is declared on it. The mechanism is broken and the assertions below \
prove nothing." >&2
    exit 1
}
echo "ok      the search mechanism finds it where it must be"

# Activation is read before any code runs, so this is the one literal that has
# to exist twice — and the copies have to agree.
if ! jq -e --arg e "workspaceContains:$name" '.activationEvents | index($e)' package.json >/dev/null 2>&1; then
    echo "manifest-name-is-defined-once: FAIL: package.json declares no activation event \
\"workspaceContains:$name\". A project carrying that manifest never wakes the extension, and \
nothing can report it — because nothing runs." >&2
    jq -r '.activationEvents[]' package.json | sed 's/^/        declared: /' >&2
    exit 1
fi
echo "ok      package.json activates on exactly that name"

# **The legacy name is the same claim, and the one nobody would notice losing.**
# FR-111: a project carrying the old name has to be seen, or nothing can tell it
# anything — an activation event that matches nothing does not fail, it simply
# never runs. Removed in 2.0.0, and until then its absence is a defect rather
# than a tidy-up.
legacy="$(grep -oE "export const LEGACY_MANIFEST = '[^']+'" "$DEF_FILE" | head -1 | sed -E "s/.*'([^']+)'.*/\1/")"
if [ -n "$legacy" ]; then
    if ! jq -e --arg e "workspaceContains:$legacy" '.activationEvents | index($e)' package.json >/dev/null 2>&1; then
        echo "manifest-name-is-defined-once: FAIL: $DEF_FILE still carries LEGACY_MANIFEST \
'$legacy', but package.json declares no \"workspaceContains:$legacy\". A project that still has \
the old manifest never wakes the extension, and nothing reports it — because nothing runs. Remove \
the constant too, or declare the event." >&2
        exit 1
    fi
    echo "ok      and on the legacy name, which is what adopts an older project"
else
    echo "ok      no legacy name is carried any more"
fi

# Everywhere else must go through the constant.
hits="$(grep -nF "$name" -- "${sources[@]}" \
    | grep -v "^$DEF_FILE:" \
    | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' || true)"
if [ -n "$hits" ]; then
    echo "manifest-name-is-defined-once: FAIL: these spell the manifest's name out instead of \
importing MANIFEST from $DEF_FILE. A rename that misses one of them leaves a path looking for a file \
nobody writes, and nothing fails:" >&2
    printf '%s\n' "$hits" | sed 's/^/        /' >&2
    exit 1
fi
echo "ok      no other source file spells the name out"

echo
echo "manifest-name-is-defined-once.test: 6 passed, 0 failed."
