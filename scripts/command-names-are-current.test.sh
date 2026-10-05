#!/usr/bin/env bash
# Every command name this extension puts in front of a person is one it actually
# contributes.
#
# **This exists because a rename left three of them behind, and two told the user
# to run a command that no longer existed.** Renaming the extension from
# `Dev Container:` to `Agent Container:` changed `package.json` and missed the
# strings in the source — a warning in open.ts and a row in view.ts both named
# `Dev Container: Configure Stacks and Limits`, which the command palette does
# not have. The failure a person sees is not an error: it is following an
# instruction and nothing happening.
#
# **The prefix is read from the manifest rather than written here**, so this
# keeps working through the next rename instead of becoming another string that
# has to be remembered. If the manifest's titles change, this guard changes with
# them.
#
# Comments are excluded for the reason the submodule guard gives: a grep cannot
# tell a recollection from an instruction, and these files are expected to record
# what they used to be called.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${COMMAND_NAMES_GUARD_ROOT:-$(cd "$HERE/.." && pwd)}"
cd "$ROOT"

mapfile -t sources < <(git ls-files 'src/*.ts' 'tools/*.ts' | grep -vE '\.test\.ts$' | sort)

# The floor. A loop over nothing passes while proving nothing.
if [ "${#sources[@]}" -lt 5 ]; then
    echo "command-names-are-current: FAIL: found only ${#sources[@]} source file(s); this check \
is not reading the tree it thinks it is and would pass vacuously." >&2
    exit 1
fi
echo "ok      ${#sources[@]} source file(s) to check"

# The manifest is the authority. Taken from a contributed title rather than
# hard-coded, so a future rename moves this guard with it.
prefix="$(jq -r '.contributes.commands[0].title | split(": ")[0]' package.json)"
if [ -z "$prefix" ] || [ "$prefix" = "null" ]; then
    echo "command-names-are-current: FAIL: could not read a command title out of package.json, \
so there is nothing to compare against and this check proves nothing." >&2
    exit 1
fi
echo "ok      the manifest says commands are named '$prefix: …'"

# Every contributed title must share it, or 'the prefix' is not a thing and the
# assertion below is comparing against one arbitrary command.
odd="$(jq -r --arg p "$prefix: " '.contributes.commands[].title | select(startswith($p) | not)' package.json)"
if [ -n "$odd" ]; then
    echo "command-names-are-current: FAIL: these contributed titles do not share the prefix \
'$prefix: ', so there is no single name to hold the source to:" >&2
    printf '%s\n' "$odd" | sed 's/^/        /' >&2
    exit 1
fi
echo "ok      every contributed command shares that prefix"

# The mechanism must find something that is really there, or its silence means
# nothing.
if ! grep -qE '[A-Za-z]+ Container: ' -- "${sources[@]}"; then
    echo "command-names-are-current: FAIL: the search found no '<word> Container: ' anywhere \
under src/ or tools/, which cannot be true while the source tells anybody to run anything. The \
mechanism is broken and the assertion below proves nothing." >&2
    exit 1
fi
echo "ok      the search mechanism finds a name that is really there"

# `Dev Containers:` — the tooling's own, plural — does not match: 'Container' has
# to be followed by the colon.
hits="$(grep -nE '[A-Za-z]+ Container: ' -- "${sources[@]}" \
    | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' \
    | grep -vF "$prefix: " || true)"
if [ -n "$hits" ]; then
    echo "command-names-are-current: FAIL: these name a command with a prefix the extension does \
not contribute. The palette has '$prefix: …'; anybody following these is told to run something \
that is not there, and nothing reports an error:" >&2
    printf '%s\n' "$hits" | sed 's/^/        /' >&2
    exit 1
fi
echo "ok      every command name in the source is one the manifest contributes"

echo
echo "command-names-are-current.test: 5 passed, 0 failed."
