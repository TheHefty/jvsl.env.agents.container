#!/usr/bin/env bash
# Exercises journal-move, the real script, with gh and bd standing in (story
# the-entries-in-a-tracker-move-to-the-private-repository).
#
# A tracker travels with the project's repository, so journal entries written
# there before the journal moved are moved to the developer's private one and
# deleted. The failures this guards: an entry deleted before it is safely
# there, lost from both; a day a real retro already wrote, overwritten by the
# old copy; and an item that is not a journal entry, deleted.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=core/plugin/agent-container/bin/tracker-fixture.sh
. "$HERE/tracker-fixture.sh"
# shellcheck source=core/plugin/agent-container/bin/journal-body-fixture.sh
. "$HERE/journal-body-fixture.sh"
# shellcheck source=core/plugin/agent-container/bin/journal-gh-stub.sh
. "$HERE/journal-gh-stub.sh"

failures=0
check() {
    if [ "$2" = "$3" ]; then
        echo "ok   $1"
    else
        echo "FAIL $1"
        echo "     expected: $3"
        echo "     got:      $2"
        failures=$((failures + 1))
    fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/r"
export GH_CALLS="$work/gh-calls" GH_STORE="$work/store" BD_CALLS="$work/bd-calls"
journal_gh_stub "$work/bin/gh"
cat > "$work/bin/bd" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$BD_CALLS"
[ "${BD_FAIL:-}" = delete ] && { echo "Error: database is locked" >&2; exit 1; }
exit 0
SH
chmod +x "$work/bin/bd"
git -C "$work/r" init -q && git -C "$work/r" remote add origin https://github.com/someone/demo.git
home="$work/home"; outbox="$home/journal-outbox/demo"
EXPORT="$work/export.jsonl"

reset() {
    rm -rf "$home" "$GH_STORE"; mkdir -p "$home" "$GH_STORE"
    : > "$GH_CALLS"; : > "$BD_CALLS"; : > "$EXPORT"; unset GH_FAIL BD_FAIL
    printf '%s' '{"repository": "TheHefty/journal"}' > "$home/journal.json"
}
move() {
    local code=0
    (cd "$work/r" && TZ="${ZONE:-UTC}" TRACKER_EXPORT="$EXPORT" REVIEW_BD="$work/bin/bd" REVIEW_GH="$work/bin/gh" \
        JOURNAL_HOME="$home" bash "$HERE/journal-move") > "$work/out" 2>&1 || code=$?
    echo "$code"
}
deleted() { grep '^delete ' "$BD_CALLS" | paste -sd'|' - || true; }
same() { [ "$(cat "$1")" = "$2" ] && echo same || echo differs; }

# --- moved, then removed ----------------------------------------------------------
reset
item j-28 chore closed 2 '["journal","blog-candidate"]' "" 2026-10-28T23:00:00Z "$(body x Nothing. yes '- from the tracker')"
meta j-28 day '"2026-10-28"'
item t-1 task open 2 null "c"
item e-1 feature open 2 null "Scenario: x"
check "an entry in the tracker is moved" "$(move)" "0"
check "to <project>/<day>.md in the private repository, with its content" \
    "$(same "$GH_STORE/demo/2026-10-28.md" "$(body x Nothing. yes '- from the tracker')")" "same"
check "and the item is removed from the tracker, and nothing else is" "$(deleted)" "delete j-28 --force"
check "saying where it went" "$(grep -c '^moved: j-28 to TheHefty/journal:demo/2026-10-28.md$' "$work/out")" "1"
check "and what it cannot undo: the tracker's history still holds it" \
    "$(tail -n 1 "$work/out" | grep -c "history.*refs/dolt/data.*still holds")" "1"
check "the outbox is left empty" "$(ls "$outbox" 2>/dev/null | wc -l | tr -d ' ')" "0"

# --- nothing removed before it is safely copied ------------------------------------
for failing in offline put; do
    reset
    item j-28 chore closed 2 '["journal"]' "" 2026-10-28T23:00:00Z "$(body x Nothing. no '- kept')"; meta j-28 day '"2026-10-28"'
    export GH_FAIL=$failing
    check "when the repository cannot be written ($failing), nothing is removed from the tracker" "$(move) $(deleted)" "1 "
    check "and the move says why" "$(grep -c '^kept: j-28: .*not in TheHefty/journal' "$work/out")" "1"
    if [ "$failing" = put ]; then
        check "read but not written, the entry waits in the outbox, so nothing is lost" "$(ls "$outbox")" "2026-10-28.md"
    else
        # Unread, the day may already hold a retro, which the outbox would later overwrite.
        check "unable to read the repository, nothing is written to the outbox either" "$(ls "$outbox" 2>/dev/null | wc -l | tr -d ' ')" "0"
    fi
    unset GH_FAIL
    check "run again once it can be reached, the same entry is moved and removed" "$(move) $(deleted)" "0 delete j-28 --force"
done

# --- a day a retro already wrote is never overwritten ------------------------------
reset
item j-27 chore closed 2 '["journal"]' "" 2026-10-27T23:00:00Z "$(body x Nothing. no '- the old copy')"; meta j-27 day '"2026-10-27"'
mkdir -p "$GH_STORE/demo"; body x Nothing. no '- the real retro' > "$GH_STORE/demo/2026-10-27.md"
check "a day the repository already holds, differently, is not moved" "$(move) $(deleted)" "1 "
check "its entry there is untouched" "$(grep -c 'the real retro' "$GH_STORE/demo/2026-10-27.md") $(grep -c '^api -X PUT' "$GH_CALLS" || true)" "1 0"
check "and the item is named, with why" "$(grep -c '^kept: j-27: 2026-10-27 already has a different entry in TheHefty/journal' "$work/out")" "1"

reset
item j-27 chore closed 2 '["journal"]' "" 2026-10-27T23:00:00Z "$(body x Nothing. no '- the old copy')"; meta j-27 day '"2026-10-27"'
mkdir -p "$outbox"; body x Nothing. no '- waiting retro' > "$outbox/2026-10-27.md"; export GH_FAIL=put
check "a day waiting in the outbox, differently, is not overwritten either" \
    "$(move) $(deleted) $(grep -c 'waiting retro' "$outbox/2026-10-27.md")" "1  1"
check "and is named" "$(grep -c '^kept: j-27: 2026-10-27 already has a different entry waiting in the outbox' "$work/out")" "1"
unset GH_FAIL

# --- the day, and the edges ---------------------------------------------------------
reset
item j-late chore closed 2 '["journal"]' "" 2026-10-28T01:00:00Z "$(body x Nothing. no '- late')"
ZONE=America/Sao_Paulo move > /dev/null
check "an item with no day is moved to the local date it was written: 01:00 UTC is the day before at -0300" \
    "$(ls "$GH_STORE/demo")" "2026-10-27.md"

reset
item t-1 task open 2 null "c"
check "with no journal entries in the tracker, there is nothing to move and nothing is asked" \
    "$(move) $(grep -c '^Nothing to move' "$work/out") $(wc -l < "$GH_CALLS" | tr -d ' ') $(deleted)" "0 1 0 "

reset
item j-28 chore closed 2 '["journal"]' "" 2026-10-28T23:00:00Z "$(body x Nothing. no '- x')"; meta j-28 day '"2026-10-28"'
export BD_FAIL=delete
check "a delete the tracker refuses is said, with its words" "$(move) $(grep -c '^kept: j-28: .*database is locked' "$work/out")" "1 1"
unset BD_FAIL

if [ "$failures" -gt 0 ]; then
    echo "journal-move.test: $failures failure(s)"
    exit 1
fi
echo "journal-move.test: a tracker's journal entries move to the private repository and are removed only once they are there, never over a day a retro wrote."
