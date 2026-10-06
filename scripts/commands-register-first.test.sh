#!/usr/bin/env bash
# Nothing optional runs before the commands are registered.
#
# **Because an exception before `registerCommand` leaves an extension whose
# palette entries all exist and none of which work.** That is what a person sees:
#
#     Command 'Agent Container: Build the Image' resulted in an error
#     command 'jvsl.agentContainer.build' not found
#
# — an id nobody recognises, for every command at once, with nothing saying why.
# It happened on 2026-10-06 with the older-copy notice sitting at line 15 of
# `activate` and the first registration at line 25.
#
# The rule is about order in one function, so the check is about order in one
# file. That is narrower than this repository usually likes, and it is the only
# shape available: calling `activate` needs the editor API, which the bundle
# keeps external on purpose — see tools/bundle.test.ts.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${REGISTER_FIRST_GUARD_ROOT:-$(cd "$HERE/.." && pwd)}"
cd "$ROOT"

FILE="${REGISTER_FIRST_FILE:-src/extension.ts}"

[ -f "$FILE" ] || { echo "commands-register-first: FAIL: no $FILE to read." >&2; exit 1; }

start="$(grep -n 'export async function activate' "$FILE" | head -1 | cut -d: -f1)"
[ -n "$start" ] || {
    echo "commands-register-first: FAIL: $FILE declares no activate(), so this check is not \
reading what it thinks it is." >&2
    exit 1
}
echo "ok      activate() begins at line $start"

first_register="$(awk -v s="$start" 'NR > s && /registerCommand\(/ { print NR; exit }' "$FILE")"
[ -n "$first_register" ] || {
    echo "commands-register-first: FAIL: no registerCommand after activate(), which cannot be \
true while the extension contributes commands." >&2
    exit 1
}
echo "ok      the first registerCommand is at line $first_register"

# Work the prologue does that is not registration. `createOutputChannel` and the
# `write` closure are here because every branch below needs them to say anything
# at all; a view is constructed because the commands close over it.
prologue="$(awk -v s="$start" -v e="$first_register" 'NR > s && NR < e' "$FILE")"
offenders="$(printf '%s\n' "$prologue" \
    | grep -nE '^\s*(const|let|await|void)\s' \
    | grep -vE 'createOutputChannel|const write|new SelectionView|^\s*[0-9]+:\s*//' \
    || true)"

if [ -n "$offenders" ]; then
    echo "commands-register-first: FAIL: these run before any command is registered. If one of \
them throws, every palette entry exists and none works, and the editor reports an id rather than a \
cause:" >&2
    printf '%s\n' "$offenders" | sed 's/^/        /' >&2
    echo "        Move it below the registration, and put it in a try." >&2
    exit 1
fi
echo "ok      nothing optional runs before the commands exist"

echo
echo "commands-register-first.test: 3 passed, 0 failed."
