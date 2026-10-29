#!/usr/bin/env bash
# Exercises study-sources and study-slug, the real scripts (story
# the-study-skill-builds-a-topic): the blog candidates the retro marked, and
# the topics the project report lists, each with a slug the contract accepts.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=core/plugin/agent-container/bin/tracker-fixture.sh
. "$HERE/tracker-fixture.sh"
# shellcheck source=core/plugin/agent-container/bin/journal-body-fixture.sh
. "$HERE/journal-body-fixture.sh"
# shellcheck source=core/plugin/agent-container/bin/report-fixture.sh
. "$HERE/report-fixture.sh"

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
EXPORT="$work/export.jsonl"; : > "$EXPORT"
repo "$work/r"
git -C "$work/r" remote add origin https://github.com/someone/demo.git
# The journal is in the developer's private repository, played by a gh stub
# whose files are under $GH_STORE (story the-journals-readers-read-it-from-the-
# private-repository).
mkdir -p "$work/bin" "$work/home"
export GH_CALLS="$work/gh-calls" GH_STORE="$work/store"
# shellcheck source=core/plugin/agent-container/bin/journal-gh-stub.sh
. "$HERE/journal-gh-stub.sh"
journal_gh_stub "$work/bin/gh"
printf '%s' '{"repository": "TheHefty/journal"}' > "$work/home/journal.json"
sources() { (cd "$work/r" && TRACKER_EXPORT="$EXPORT" REVIEW_GH="$work/bin/gh" JOURNAL_HOME="$work/home" bash "$HERE/study-sources"); }
under() { sources | awk -v h="## $1" '$0 == h {on = 1; next} /^## / {on = 0} on' | sed '/^$/d'; }

check "with no journal and no report, both say there is nothing yet" "$(sources | grep -c '^Nothing yet\.$')" "2"

mkdir -p "$GH_STORE/demo"
body x Nothing. yes > "$GH_STORE/demo/2026-10-27.md"
body x Nothing. no > "$GH_STORE/demo/2026-10-26.md"
check "a discovery the private repository's entry marks as a blog candidate is listed, with its day" \
    "$(under 'From the journal' | grep -c '^- bd prints labels as null, not as an empty list — 2026-10-27 — slug: bd-prints-labels-as-null-not-as-an-empty-list$')" "1"
check "a discovery marked no is not listed" "$(under 'From the journal' | wc -l | tr -d ' ')" "1"

# One entry, two discoveries: only the one marked yes is a candidate.
body x Nothing. yes | awk '/^## Surprised$/ {print "### A default nobody chose"; print "How it was found: x"; print "Why it matters: y"; print "Blog candidate: no"} {print}' \
    > "$GH_STORE/demo/2026-10-28.md"
check "in an entry with two discoveries, the one marked no is not listed" \
    "$(under 'From the journal' | grep -c 'A default nobody chose' || true) $(under 'From the journal' | grep -c '2026-10-28')" "0 1"

# Still waiting to be sent, it is the developer's all the same.
mkdir -p "$work/home/journal-outbox/demo"
body x Nothing. yes | sed 's/^### bd prints labels as null.*/### An outbox is kept before it is sent/' > "$work/home/journal-outbox/demo/2026-10-29.md"
export GH_FAIL=put
check "a blog candidate in an entry waiting in the outbox is listed too" \
    "$(under 'From the journal' | grep -c '^- An outbox is kept before it is sent — 2026-10-29')" "1"
unset GH_FAIL

# Candidates in the tracker, from before the journal moved, are not read.
item j-20 chore closed 2 '["journal","blog-candidate"]' "" 2026-10-20T22:00:00Z "$(body x Nothing. yes | sed 's/^### bd prints.*/### From the tracker/')"
check "the tracker is not a source any more" "$(under 'From the journal' | grep -c 'From the tracker' || true)" "0"

mkdir -p "$work/r/docs"; report > "$work/r/docs/REPORT.md"
check "the report's topics are listed with their files" \
    "$(under 'From the report' | grep -c '^- Constants where configuration should be — Files: `src/app.js`, `README.md` — slug: constants-where-configuration-should-be$')" "1"

check "a slug is lowercase words joined by dashes" "$(bash "$HERE/study-slug" "Why bd's labels are NULL (not [])!")" "why-bd-s-labels-are-null-not"
check "and at most sixty characters, never ending on a dash" \
    "$(s="$(bash "$HERE/study-slug" "$(printf 'word %.0s' $(seq 20))")"; echo "${#s} ${s: -1}")" "59 d"
check "a title with nothing to make a slug of is refused" "$(bash "$HERE/study-slug" '!!!' > /dev/null 2>&1; echo $?)" "1"

if [ "$failures" -gt 0 ]; then
    echo "study-sources.test: $failures failure(s)"
    exit 1
fi
echo "study-sources.test: blog candidates by day and report topics by file, each with a slug the contract accepts."
