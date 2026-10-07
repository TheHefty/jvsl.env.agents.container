#!/usr/bin/env bash
# The planning lives in the tracker, and the charter and the SRS carry no state.
#
# FR-109, amended on 2026-10-07 (story the-guard-holds-the-split in the
# tracker). Two halves, each a convention until something checks it:
#
#   - nothing but a .gitkeep under docs/PLANNING/ or docs/DEBTS/: an epic,
#     story, task or debt written as a file is the split coming undone. The
#     folders stay for projects without a tracker, and are not a failure.
#   - no status table in the charter or the SRS: a markdown table whose header
#     row has a Status column, the shape the old epic and story tables had.
#     **Measured before writing this:** "shipped" and "done" appear there as
#     prose, and each document has its own `| **Status** | Accepted |` row, a
#     key-value line rather than a header. A word check would have failed on
#     day one; this one does not.
#
# It runs over this repository, then over fixtures it builds, so each case it
# claims to catch is seen caught on every run.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

# Prints one line per violation in the tree at $1; prints nothing when it holds.
violations() {
    local root="$1" docs=()
    while IFS= read -r f; do
        [ "$(basename "$f")" = .gitkeep ] || echo "$f: an epic, story, task or debt as a file; it belongs in the tracker"
    done < <(cd "$root" && find docs/PLANNING docs/DEBTS -type f 2>/dev/null | sort)
    [ -f "$root/docs/CHARTER.md" ] && docs+=("$root/docs/CHARTER.md")
    [ -f "$root/docs/SRS.md" ] && docs+=("$root/docs/SRS.md")
    while IFS= read -r f; do docs+=("$f"); done < <(find "$root/docs/SRS" -name '*.md' 2>/dev/null | sort)
    [ "${#docs[@]}" -ge 2 ] || { echo "found ${#docs[@]} charter/SRS file(s) under $root; nothing to check would pass vacuously"; return; }
    for f in "${docs[@]}"; do
        # A header row is a table line immediately followed by a |---| separator.
        awk -v file="${f#"$root"/}" '
            prev != "" && /^[[:space:]]*\|?[[:space:]]*:?-{3,}/ {
                n = split(prev, cells, "|")
                for (i = 1; i <= n; i++) {
                    c = cells[i]; gsub(/[*_`[:space:]]/, "", c)
                    if (tolower(c) == "status") { print file ":" NR-1 ": a status table; the charter and the SRS carry no state"; break }
                }
            }
            { prev = ($0 ~ /\|/) ? $0 : "" }
        ' "$f"
    done
}

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}

real="$(violations "$REPO")"
if [ -n "$real" ]; then
    echo "the-guard-holds-the-split: FAIL in this repository:" >&2
    while IFS= read -r line; do printf '        %s\n' "$line" >&2; done <<<"$real"
    failures=$((failures + 1))
else
    echo "ok   this repository keeps the split"
fi

# --- fixtures: each case the guard claims, seen on every run ---------------
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fixture() {
    rm -rf "$work/t"; mkdir -p "$work/t/docs/PLANNING" "$work/t/docs/DEBTS" "$work/t/docs/SRS"
    touch "$work/t/docs/PLANNING/.gitkeep" "$work/t/docs/DEBTS/.gitkeep"
    printf '# Charter\n\n| | |\n|---|---|\n| **Status** | Accepted |\n\nWhat shipped is done.\n' > "$work/t/docs/CHARTER.md"
    printf '# SRS\n\nNothing here is in progress.\n' > "$work/t/docs/SRS/README.md"
}

fixture
check "the folders with only a .gitkeep, prose and a document's own Status row pass" "$(violations "$work/t")" ""

fixture; printf '# Story\n' > "$work/t/docs/PLANNING/a-story.md"
check "an epic, story or task as a file is refused, named" "$(violations "$work/t" | grep -c 'docs/PLANNING/a-story.md')" "1"

fixture; mkdir -p "$work/t/docs/DEBTS/x"; printf '# Debt\n' > "$work/t/docs/DEBTS/x/OVERVIEW.md"
check "a debt as a file is refused, named" "$(violations "$work/t" | grep -c 'docs/DEBTS/x/OVERVIEW.md')" "1"

for header in '| # | Story | Status |' '# | Story | Status' '| Order | Task | **Status** |' '|  #  |  Story  |   Status   |'; do
    fixture; printf '\n%s\n|---|---|---|\n| 1 | x | Done |\n' "$header" >> "$work/t/docs/SRS/README.md"
    check "a status table is refused: $header" "$(violations "$work/t" | grep -c 'a status table')" "1"
done

rm -rf "$work/t"; mkdir -p "$work/t/docs"
check "a tree with no charter or SRS is not a pass" "$(violations "$work/t" | grep -c 'pass vacuously')" "1"

echo
[ "$failures" -eq 0 ] && echo "the-guard-holds-the-split.test: all checks passed." || { echo "the-guard-holds-the-split.test: $failures failed." >&2; exit 1; }
