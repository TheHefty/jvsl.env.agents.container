#!/usr/bin/env bash
# The board runs exactly one bd command, and it only reads.
#
# **FR-118: the page shows, and only shows.** The board's code runs bd inside
# the project's container, and every bd subcommand but a few changes the
# tracker. A board that grew a `bd update` to "help" would be a page that writes,
# with nothing in its tests saying so, because its tests are about what it
# shows. So the bd subcommands named anywhere in the board's source are listed, and
# the list must be exactly `export`.
#
# BOARD_GUARD_ROOT points this at another tree, which is how a write was first
# seen to fail it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${BOARD_GUARD_ROOT:-$(cd "$HERE/.." && pwd)}"
cd "$ROOT"

# git ls-files, not a shell glob: it sees the board's files wherever under src/
# they sit (scripts/every-source-is-read.test.sh).
mapfile -t sources < <(git ls-files 'src/board*.ts' 'src/board/*.ts' | grep -vE '\.test\.ts$' | sort -u || true)
if [ "${#sources[@]}" -lt 3 ]; then
    echo "board-only-reads: FAIL: found ${#sources[@]} board source file(s); this check is not reading \
the tree it thinks it is and would pass vacuously." >&2
    exit 1
fi
echo "ok      ${#sources[@]} board source file(s) to check"

# Both spellings a bd call can take here: an argument list ('bd', 'export') and
# a command line (`bd export` inside a string).
# Comments are prose, and the board's comments discuss other bd commands on
# purpose (why `bd list` was not used, what `bd ready` is), so only code counts.
code="$(grep -hvE '^[[:space:]]*(//|\*|/\*)' "${sources[@]}")"
found="$( { printf '%s\n' "$code" | grep -oE "'bd',[[:space:]]*'[a-z-]+'" | sed -E "s/.*'([a-z-]+)'$/\1/";
            printf '%s\n' "$code" | grep -oE "\bbd [a-z][a-z-]+" | awk '{print $2}'; } | sort -u || true)"

if [ -z "$found" ]; then
    echo "board-only-reads: FAIL: no bd command found in the board at all, which cannot be true while \
it reads the tracker. The search is broken." >&2
    exit 1
fi
echo "ok      the search finds the bd command that is really there"

others="$(printf '%s\n' "$found" | grep -vx 'export' || true)"
if [ -n "$others" ]; then
    echo "board-only-reads: FAIL: the board names bd subcommands other than \`export\`:" >&2
    printf '        bd %s\n' $others >&2
    echo "        FR-118: the page reads and writes nothing. If one of these only reads, say why in this \
guard and allow it by name." >&2
    exit 1
fi
echo "ok      the only bd command the board names is \`bd export\`"
echo
echo "board-only-reads.test: 3 passed, 0 failed."
