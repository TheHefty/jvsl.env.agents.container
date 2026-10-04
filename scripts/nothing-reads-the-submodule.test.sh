#!/usr/bin/env bash
# No code in this extension reads a project's `.code-server/`.
#
# **This is the assertion that makes deleting FR-22 safe**, and it is a stronger
# claim than "the version refusal is gone". That requirement existed because a
# project on an older template opened and got an editor with no extensions at
# all. The risk did not vanish when the extension started carrying the image's
# content — it moved: there is no second version to disagree with *provided
# nothing still reads the submodule*. If something does, a project that still
# has one composes from a different place than a project that does not, and the
# difference is invisible.
#
# **The slash is the whole pattern.** `.code-server.stack.json` is the
# manifest's own name, at the workspace root, and it keeps that name after the
# submodule is gone — a check forbidding the bare substring would forbid the one
# file the extension is supposed to read. That mistake was made once already, in
# an assertion written for the compose command.
#
# Comments are excluded for the reason the launcher guard gives: a grep cannot
# tell a recollection from an instruction, and these files are expected to record
# what they used to do.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${SUBMODULE_GUARD_ROOT:-$(cd "$HERE/.." && pwd)}"
cd "$ROOT"

mapfile -t sources < <(git ls-files 'src/*.ts' 'tools/*.ts' | grep -vE '\.test\.ts$' | sort)

# The floor. A loop over nothing passes while proving nothing.
if [ "${#sources[@]}" -lt 5 ]; then
    echo "nothing-reads-the-submodule: FAIL: found only ${#sources[@]} source file(s) under \
src/ and tools/; this check is not reading the tree it thinks it is and would pass vacuously." >&2
    exit 1
fi
echo "ok      ${#sources[@]} source file(s) to check"

# The mechanism must find something that is really there, or its silence means
# nothing. The manifest's name is in every one of these files' vicinity.
if ! grep -qF '.code-server.stack.json' -- "${sources[@]}"; then
    echo "nothing-reads-the-submodule: FAIL: the search found no mention of \
'.code-server.stack.json' anywhere, which cannot be true — the manifest is what activation is \
declared on. The mechanism is broken and the assertion below proves nothing." >&2
    exit 1
fi
echo "ok      the search mechanism finds a string that is really there"

# **Two shapes, and the second was nearly missed.** A path spelled
# `.code-server/…` is the obvious one. The other is `join(root, '.code-server',
# 'version.txt')`, where the slash never appears at all — which is how the code
# this guard was written to replace actually did it. A check for the slash alone
# would have gone green the moment the string literals were deleted, leaving the
# segment form free to come back.
#
# `'.code-server'` as a whole quoted segment does not match
# `'.code-server.stack.json'`, which is the manifest and must stay readable.
hits="$(grep -nE "\.code-server/|['\"]\.code-server['\"]" -- "${sources[@]}" \
    | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' || true)"
if [ -n "$hits" ]; then
    echo "nothing-reads-the-submodule: FAIL: these name a path inside a project's \
\`.code-server/\`. The extension carries the image's content; a project is not required to have a \
submodule, and one that still has it carries whatever version it last bumped to:" >&2
    printf '%s\n' "$hits" | sed 's/^/        /' >&2
    exit 1
fi
echo "ok      nothing under src/ or tools/ reads a project's .code-server/"

echo
echo "nothing-reads-the-submodule.test: 3 passed, 0 failed."
