#!/usr/bin/env bash
# activate() does not await anything.
#
# **The editor waits for activation before it dispatches a command**, so anything
# activate() awaits is something every command waits behind. On 2026-10-06 the
# extension sat at "Activating…" in Running Extensions while every palette entry
# answered `command 'jvsl.agentContainer.build' not found`. The commands were
# registered; activation just never finished, because activate() awaited the
# open flow — and the open flow awaits a notification being clicked, a build in a
# terminal finishing, and a reopen.
#
# Bounding docker (scripts/no-unbounded-docker-call.test.sh) did not cover it and
# made one path likelier: a slow daemon now reads as `unknown`, which refuses,
# and the refusal awaited its notification.
#
# So the rule is structural rather than a list of slow things: activate()
# registers, starts the rest without waiting for it, and returns.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ACTIVATE_GUARD_ROOT:-$(cd "$HERE/.." && pwd)}"
cd "$ROOT"
FILE="${ACTIVATE_GUARD_FILE:-src/extension.ts}"

start="$(grep -n 'export async function activate' "$FILE" | head -1 | cut -d: -f1)"
[ -n "$start" ] || { echo "activate-returns-promptly: FAIL: no activate() in $FILE." >&2; exit 1; }
end="$(awk -v s="$start" 'NR > s && /^}/ { print NR; exit }' "$FILE")"
[ -n "$end" ] || { echo "activate-returns-promptly: FAIL: could not find the end of activate()." >&2; exit 1; }
echo "ok      activate() spans lines $start-$end"

hits="$(awk -v s="$start" -v e="$end" 'NR > s && NR < e { print NR": "$0 }' "$FILE" \
    | grep -E '\bawait\b' | grep -vE '^[0-9]+:\s*//' || true)"
if [ -n "$hits" ]; then
    echo "activate-returns-promptly: FAIL: activate() awaits these, and every command waits \
behind whatever activate() waits for — a notification nobody clicks leaves the extension at \
'Activating…' with every command reporting that it does not exist:" >&2
    printf '        %s\n' "$hits" >&2
    echo "        Start them from a function activate() does not await, with a catch that says why." >&2
    exit 1
fi
echo "ok      activate() awaits nothing"

# **And the older-copy notice runs at startup, not inside a command.** From #110
# until this check existed it sat in the Show What Was Detected callback: a text
# replacement matched the indented copy of the line it was aimed at. Typecheck,
# every guard and twenty-nine CI jobs passed, and the notice appeared only when
# somebody asked to see what was detected.
# startup() left the entry point with the other command bodies (story
# the-commands-leave-the-hub); activate() still starts it, and this reads it
# where it lives.
STARTUP_FILE="${ACTIVATE_GUARD_STARTUP_FILE:-src/open/startup.ts}"
sstart="$(grep -nE '^(export )?async function startup' "$STARTUP_FILE" | head -1 | cut -d: -f1)"
send="$(awk -v s="${sstart:-0}" 'NR > s && /^}/ { print NR; exit }' "$STARTUP_FILE")"
if [ -z "$sstart" ] || ! awk -v s="$sstart" -v e="$send" 'NR > s && NR < e' "$STARTUP_FILE" | grep -q 'olderCopyNotice('; then
    echo "activate-returns-promptly: FAIL: the older-copy notice is not called from startup(), so \
it does not run when the extension starts — it runs wherever it ended up instead." >&2
    exit 1
fi
echo "ok      the older-copy notice runs at startup"
echo
echo "activate-returns-promptly.test: 3 passed, 0 failed."
