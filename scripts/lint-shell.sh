#!/usr/bin/env bash
# shellcheck over every shell script this repository tracks.
#
# **Listed through git, never through a shell glob**, because a glob stops at
# the first folder and a script with no extension matches no `*.sh`: both would
# be reported clean while never read (scripts/lint-covers-everything.test.sh).
# A script is a tracked file ending in .sh, or one with no extension whose first
# line is a sh or bash shebang (core/services/*/run, scripts/the-*).
#
# **At --severity=warning**, because the lint is for defects, not style
# (decided 2026-10-09): errors and warnings fail, info and style are not read.
#
#   lint-shell.sh          lint them
#   lint-shell.sh --list   print the files it would lint, and nothing else
#
# SHELLCHECK names the binary, which is how its absence is tested.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/.."

files=()
while IFS= read -r -d '' f; do
    [ -f "$f" ] || continue
    # The file's own name decides, never the path: .githooks/pre-commit has a
    # dot in its folder and none in its name.
    case "${f##*/}" in
        *.sh) files+=("$f") ;;
        *.*) ;;
        *) if head -c 64 "$f" | head -1 | grep -qE '^#!.*\b(ba)?sh\b'; then files+=("$f"); fi ;;
    esac
done < <(git ls-files -z)

if [ "${1:-}" = "--list" ]; then
    printf '%s\n' "${files[@]}"
    exit 0
fi

SHELLCHECK="${SHELLCHECK:-shellcheck}"
if ! command -v "$SHELLCHECK" >/dev/null 2>&1; then
    echo "lint-shell: shellcheck is not installed, so ${#files[@]} shell scripts would go unread. It ships in the" >&2
    echo "lint-shell: agent container's image (rebuild it), or install it: apt-get install shellcheck." >&2
    exit 1
fi

echo "lint-shell: $("$SHELLCHECK" --version | sed -n 's/^version: //p'), ${#files[@]} scripts, --severity=warning"
exec "$SHELLCHECK" --severity=warning --external-sources "${files[@]}"
