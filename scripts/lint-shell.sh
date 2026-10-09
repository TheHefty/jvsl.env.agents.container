#!/usr/bin/env bash
# Every shell script this repository tracks, through shellcheck.
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
    echo "lint-shell: shellcheck is not installed, so ${#files[@]} shell scripts would go unread. The agent" >&2
    echo "lint-shell: container's image installs the version core/shellcheck.pin names: rebuild it." >&2
    exit 1
fi

# **One version, the pinned one** (core/shellcheck.pin). The runner had 0.9.0,
# the image would have had Debian's and a developer whatever they downloaded,
# and two versions disagree about what is a finding: a hook passes what CI
# refuses. Decided 2026-10-09: the image and CI both install the pin.
pinned="$(cut -d' ' -f1 core/shellcheck.pin)"
version="$("$SHELLCHECK" --version | sed -n 's/^version: //p')"
if [ "$version" != "$pinned" ]; then
    echo "lint-shell: expects shellcheck $pinned (core/shellcheck.pin), got $version at $(command -v "$SHELLCHECK")." >&2
    echo "lint-shell: the agent container's image installs the pinned one: rebuild it." >&2
    exit 1
fi
echo "lint-shell: shellcheck $version, ${#files[@]} scripts, --severity=warning"
exec "$SHELLCHECK" --severity=warning --external-sources "${files[@]}"
