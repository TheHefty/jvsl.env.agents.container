#!/usr/bin/env bash
# Exercises planning-brief, the real script, against a fixture `bd export`.
#
# The brief is what the developer chooses the day from, so the failure it
# guards is a wrong picture: a blocked task offered as ready, a finished blocker
# still holding something back, a parent read as a blocker, today's journal
# taken for yesterday's (story the-planning).
set -euo pipefail

# The fixture's times are UTC midnights, and the brief reads days by the local
# date — so the test pins UTC. Without it, a developer at -0300 or +0900 gets a
# different day for the same fixture and a red suite for code that is right
# (found 2026-10-28, the first day this container had the host's timezone).
# Local days themselves are held by retro-gather's and journal-write's tests,
# which set America/Sao_Paulo on purpose.
export TZ=UTC

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/planning-brief"
# shellcheck source=core/plugin/agent-container/bin/tracker-fixture.sh
. "$HERE/tracker-fixture.sh"

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
EXPORT="$work/export.jsonl"

# The journal lives in the developer's private repository, played by a gh stub
# whose files are under $GH_STORE, and in the outbox under $home (story
# the-journals-readers-read-it-from-the-private-repository). The project is
# named by its origin, as journal-write names it: demo, not the folder r.
mkdir -p "$work/bin"
export GH_CALLS="$work/gh-calls" GH_STORE="$work/store"
# shellcheck source=core/plugin/agent-container/bin/journal-gh-stub.sh
. "$HERE/journal-gh-stub.sh"
journal_gh_stub "$work/bin/gh"
home="$work/home"; outbox="$home/journal-outbox/demo"
mkdir -p "$home" "$GH_STORE/demo" "$work/r"; : > "$GH_CALLS"
printf '%s' '{"repository": "TheHefty/journal"}' > "$home/journal.json"
git -C "$work/r" init -q && git -C "$work/r" remote add origin https://github.com/someone/demo.git

brief() { (cd "$work/r" && TRACKER_EXPORT="$EXPORT" PLANNING_TODAY=2026-10-28 REVIEW_GH="$work/bin/gh" JOURNAL_HOME="$home" bash "$SCRIPT"); }
# The ids listed under one section, in order, space-separated.
section() { brief | awk -v h="## $1" '$0 == h {on = 1; next} /^## / {on = 0} on && /^- / {print $2}' | paste -sd' ' -; }
left_open() { brief | awk '$0 == "## Left open yesterday" {on = 1; next} /^## / {on = 0} on' | sed '/^$/d'; }

item s1 feature open 2 null "Scenario: x"
item t-going task in_progress 2 null "criterion"
item t-low task open 3 null "criterion" 2026-10-01T00:00:00Z
item t-high task open 1 null "criterion" 2026-10-05T00:00:00Z
item t-tie-old task open 2 null "criterion" 2026-10-01T00:00:00Z "" 0
item t-tie-key task open 2 null "criterion" 2026-10-09T00:00:00Z "" 3
item t-proposal task deferred 2 '["proposed"]' "criterion"
# Labelled a proposal but not deferred: half of a proposal is still one.
item t-half-proposal task open 2 '["proposed"]' "criterion"
item t-blocked task open 1 null "criterion"
dep t-blocked t-high blocks
item t-was-blocked task open 2 null "criterion" 2026-10-02T00:00:00Z
item t-closed-blocker task closed 1 null "criterion"
dep t-was-blocked t-closed-blocker blocks
item t-child task open 2 null "criterion" 2026-10-03T00:00:00Z
dep t-child s1 parent-child
item t-done task closed 2 null "criterion"
item t-nocrit task open 2 null "" 2026-10-04T00:00:00Z
item d1 bug open 2 '["defect"]'
item t-debt task open 4 null "c" 2026-10-05T00:00:00Z
dep t-debt d1 parent-child

check "in progress lists what is being worked on" "$(section 'In progress')" "t-going"
check "a blocked task is never offered as ready" "$(section Ready | tr ' ' '\n' | grep -cx t-blocked || true)" "0"
check "it is listed as blocked" "$(section Blocked)" "t-blocked"
check "naming what blocks it" "$(brief | grep -c '^- t-blocked .*blocked by t-high')" "1"
check "a closed blocker no longer blocks" "$(section Ready | tr ' ' '\n' | grep -cx t-was-blocked)" "1"
check "a parent is not a blocker" "$(section Ready | tr ' ' '\n' | grep -cx t-child)" "1"
check "ready is ordered by priority, then by what each unblocks, then by age" \
    "$(section Ready)" "t-high t-tie-key t-tie-old t-was-blocked t-child t-nocrit t-low t-debt"
check "a task whose parent is a debt is offered like any other, and the debt itself is not" \
    "$(section Ready | tr ' ' '\n' | grep -cx t-debt) $(section Ready | tr ' ' '\n' | grep -cx d1 || true)" "1 0"
check "a task with no criterion is offered, marked so the planning asks for one" \
    "$(brief | grep -c '^- t-nocrit .*no done criterion')" "1"
check "proposals, stories and closed tasks are not offered" \
    "$(section Ready | tr ' ' '\n' | grep -cxE 't-proposal|t-half-proposal|s1|t-done' || true)" "0"

# The brief's day is the local one (PLANNING_TODAY pins it), and so are the days
# the work happened on: every fixture item above was touched in early October.
check "with no journal yet, the brief says so" "$(left_open | grep -c '^No journal entry yet\.$')" "1"
check "and a day with work and no entry is said to have skipped its retro" \
    "$(left_open | grep -c '^No journal for 2026-10-09, which had work: its retro was skipped\.$')" "1"

# --- entries in the private repository, by the day their file is named for ------
# shellcheck source=core/plugin/agent-container/bin/journal-body-fixture.sh
. "$HERE/journal-body-fixture.sh"
body x Nothing. no '- the oldest point' > "$GH_STORE/demo/2026-10-26.md"
body x Nothing. no '- the second half of the migration
- ask about the cache' > "$GH_STORE/demo/2026-10-27.md"
body x Nothing. no '- written this morning' > "$GH_STORE/demo/2026-10-28.md"
check "yesterday's open points come from the entry for the latest day before today, that section only" \
    "$(left_open | grep -v '^No journal' | paste -sd'|' -)" "- the second half of the migration|- ask about the cache"
# Entries the tracker still holds from before the journal moved are not work.
item j-old chore closed 2 '["journal"]' "" 2026-10-20T18:00:00Z "$(body x Nothing. no '- from the tracker')"
check "and journal entries left in the tracker are neither tasks to offer nor read" \
    "$(section Ready | tr ' ' '\n' | grep -c '^j-' || true) $(left_open | grep -c 'from the tracker' || true)" "0 0"
check "but the brief says they are there, and what moves them (story the-entries-in-a-tracker-move-to-the-private-repository)" \
    "$(left_open | grep -c '^The tracker still holds 1 journal entry from before the journal moved: journal-move moves it to the private repository\.$')" "1"
item j-older chore closed 2 '["journal"]' "" 2026-10-19T18:00:00Z "$(body x Nothing. no '- older')"
check "two are counted as two" "$(left_open | grep -c '^The tracker still holds 2 journal entries from before the journal moved: journal-move moves them to the private repository\.$')" "1"
grep -v '"id":"j-older"' "$EXPORT" > "$work/e2"; mv "$work/e2" "$EXPORT"

# Touched on the 27th, and the 27th has its entry: nothing was skipped.
item t-27 task open 2 null "c" 2026-10-27T15:00:00Z
check "a day with work and its entry is not called skipped" "$(left_open | grep -c 'skipped' || true)" "0"
mv "$GH_STORE/demo/2026-10-27.md" "$work/27.md"
check "a day with work and no entry in the repository or the outbox is called skipped, by its local date" \
    "$(left_open | grep -c '^No journal for 2026-10-27, which had work: its retro was skipped\.$')" "1"

# --- an entry still waiting in the outbox ------------------------------------------
mkdir -p "$outbox"; cp "$work/27.md" "$outbox/2026-10-27.md"
export GH_FAIL=put
check "an entry waiting in the outbox is read, and said not to be sent yet" \
    "$(left_open | grep -c '^The entry for 2026-10-27 is not sent yet: it waits in the outbox on this machine\.$') $(left_open | grep -c '^- ask about the cache$') $(left_open | grep -c 'skipped' || true)" "1 1 0"
body x Nothing. no '- the old point' > "$GH_STORE/demo/2026-10-27.md"
check "when the repository and the outbox both hold a day, the outbox's newer entry is the one read" \
    "$(left_open | grep -c '^- the old point$' || true) $(left_open | grep -c '^- ask about the cache$')" "0 1"
unset GH_FAIL
left_open > /dev/null
check "the planning sends what was waiting before it reads" \
    "$(ls "$outbox" | wc -l | tr -d ' ') $(grep -c 'ask about the cache' "$GH_STORE/demo/2026-10-27.md")" "0 1"

# --- the repository cannot be read --------------------------------------------------
rm "$GH_STORE/demo/2026-10-27.md"; cp "$work/27.md" "$outbox/2026-10-27.md"
export GH_FAIL=offline
check "with GitHub unreachable, the brief says the journal could not be read, and why" \
    "$(left_open | grep -c '^The journal could not be read from TheHefty/journal: error connecting to api.github.com\. Only entries waiting on this machine are shown\.$')" "1"
check "still shows what waits in the outbox" "$(left_open | grep -c '^- ask about the cache$')" "1"
rm "$outbox/2026-10-27.md"
check "and calls no day skipped, since it could not see the entries" "$(left_open | grep -c 'skipped' || true)" "0"
unset GH_FAIL
mv "$home/journal.json" "$work/journal.json"
check "with no repository named, the brief says so instead of calling a day skipped" \
    "$(left_open | grep -c '^The journal could not be read: no journal repository is named in .*journal.json\. Only entries waiting on this machine are shown\.$') $(left_open | grep -c 'skipped' || true)" "1 0"
mv "$work/journal.json" "$home/journal.json"

# --- the writer and the readers name the project the same way -------------------------
rm -rf "$GH_STORE/demo"; mkdir -p "$GH_STORE"
body x Nothing. no '- written by the retro' > "$work/entry.md"
(cd "$work/r" && PATH="$work/bin:$PATH" REVIEW_GH="$work/bin/gh" JOURNAL_HOME="$home" JOURNAL_TODAY=2026-10-27 \
    bash "$HERE/journal-write" "$work/entry.md" > /dev/null 2>&1)
check "an entry journal-write sent is the one the planning reads" "$(left_open | grep -c '^- written by the retro$')" "1"

if [ "$failures" -gt 0 ]; then
    echo "planning-brief.test: $failures failure(s)"
    exit 1
fi
echo "planning-brief.test: in progress, blocked with its blockers, ready in order, and yesterday's open points — each from the export as it is."
