#!/usr/bin/env bash
# Exercises the migration against a fake tracker and a throwaway tree.
#
# **The first failure scenario is what this is for**: an item created empty or
# truncated while the file is deleted anyway, both halves reporting success.
# So the fake `bd` can be told to truncate, and the test asserts that nothing is
# deleted when it does.
#
# The comparison the migration makes is exact after one named transformation —
# the file's content with trailing newlines removed. Measured against the real
# binary: it returns 11,568 bytes for an 11,569-byte file and changes nothing
# else. See the task design.
set -euo pipefail

# **Every run is from a scratch directory, with every path explicit.** The
# script's defaults are relative (docs/PLANNING, docs/DEBTS), and the first
# version of these tests ran from the repository with MIGRATE_DEBTS unset: it
# read the real debts, and only an unrelated failure stopped it before the
# deletion phase.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/migrate-planning.sh"

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
mkdir -p "$work/bin"

# A fake tracker: `create` records the body under an id and prints JSON, `show`
# returns it with the trailing newline stripped — which is what the real one
# does. BD_FAKE_TRUNCATE makes it keep one byte less, standing in for every way
# a body can arrive incomplete.
cat > "$work/bin/bd" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
store="${BD_FAKE_STORE:?}"
mkdir -p "$store"
case "${1:-}" in
  create)
    shift
    title=""; desc=""; parent=""; type=""; labels=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --description) desc="$2"; shift 2 ;;
        --parent) parent="$2"; shift 2 ;;
        --type) type="$2"; shift 2 ;;
        --labels) labels="$2"; shift 2 ;;
        --acceptance) shift 2 ;;
        --json) shift ;;
        *) title="$1"; shift ;;
      esac
    done
    n=$(( $(ls "$store" 2>/dev/null | grep -c '\.body$' || true) + 1 ))
    id="${parent:+$parent.}x$n"
    printf '%s' "${desc%$'\n'}" > "$store/$id.body"
    [ -n "${BD_FAKE_TRUNCATE:-}" ] && printf '%s' "${desc:0:${#desc}-2}" > "$store/$id.body"
    printf '%s' "$title" > "$store/$id.title"
    printf '%s' "$type" > "$store/$id.type"
    printf '%s' "$labels" > "$store/$id.labels"
    printf '{"id":"%s","title":"%s"}\n' "$id" "$title"
    ;;
  close)
    id="$2"; shift 2
    [ "${1:-}" = "--reason" ] || { echo "fake bd: close without --reason" >&2; exit 2; }
    # Measured on 2026-10-07, in a rehearsal against the real binary: bd will
    # not close an issue while a child is open ("close children first").
    for child in "$store/$id".*.body; do
      [ -e "$child" ] || continue
      c="$(basename "$child" .body)"
      [ -f "$store/$c.closed" ] || { echo "cannot close $id: open child issue(s); close children first" >&2; exit 1; }
    done
    printf '%s' "$2" > "$store/$id.closed"
    ;;
  show)
    id="$2"
    # **A list with the item in it**, as the real bd prints: measured on
    # 2026-10-07, when the first real migration stopped at this read-back
    # because the stand-in had returned a bare object.
    printf '[{"id":"%s","description":%s}]\n' "$id" \
      "$(python3 -c 'import json,sys;print(json.dumps(open(sys.argv[1]).read()))' "$store/$id.body")"
    ;;
  *) exit 0 ;;
esac
SH
chmod +x "$work/bin/bd"
export PATH="$work/bin:$PATH"

make_tree() {
    rm -rf "$work/tree"; mkdir -p "$work/tree/an-epic/a-story/tasks"
    printf '# Epic\n\nthe epic body\n' > "$work/tree/an-epic/README.md"
    printf '# Story\n\nthe story body\n' > "$work/tree/an-epic/a-story/OVERVIEW.md"
    printf 'Feature: x\n' > "$work/tree/an-epic/a-story/a-story.feature"
    printf '# Task\n\nthe task body\n' > "$work/tree/an-epic/a-story/tasks/a-task.md"
}

run() {
    rm -rf "$work/store"
    mkdir -p "$work/nodebts"
    ( cd "$work" && BD_FAKE_STORE="$work/store" MIGRATE_ROOT="$work/tree" MIGRATE_DEBTS="$work/nodebts" \
        bash "$SCRIPT" >"$work/out" 2>&1 )
    echo "$?"
}

# --- the happy path --------------------------------------------------------

make_tree
check "a clean tree migrates" "$(run)" "0"
check "and the documents are gone" \
    "$(find "$work/tree" -name '*.md' -o -name '*.feature' | wc -l)" "0"
check "one item per document" "$(ls "$work/store" | grep -c "\.body$")" "3"

# --- the first failure scenario --------------------------------------------

make_tree
export BD_FAKE_TRUNCATE=1
check "a truncated body fails the migration" "$([ "$(run)" = "0" ] && echo no || echo yes)" "yes"
check "and nothing is deleted when it does" \
    "$([ -f "$work/tree/an-epic/a-story/OVERVIEW.md" ] && echo kept || echo gone)" "kept"
unset BD_FAKE_TRUNCATE

# --- state, read from the parent's table (task: the-migration-carries-state-and-debts)

# Three header shapes, measured across the repository, and the ways a finished
# status is spelled: bold, with a PR number, with "in #N".
make_state_tree() {
    rm -rf "$work/tree" "$work/debts"
    local t="$work/tree"
    mkdir -p "$t/epic-one/story-done/tasks" "$t/epic-one/story-draft/tasks" "$t/epic-two/only-story"
    cat > "$t/epic-one/README.md" <<'MD'
# Epic one

| # | Story | Status |
|---|---|---|
| 1 | [story done](story-done/) | **Shipped** — both tasks |
| 2 | [story draft](story-draft/) | Draft |
| 3 | a story with no folder | Not started |
MD
    cat > "$t/epic-one/story-done/OVERVIEW.md" <<'MD'
# Story done

| Order | Task | Repo | Status |
|---|---|---|---|
| 1 | [`tasks/task-a.md`](tasks/task-a.md) | extension | Done — #25 |
| 2 | [`tasks/task-b.md`](tasks/task-b.md) | extension | Shipped in #123 |
MD
    printf '# a\n' > "$t/epic-one/story-done/tasks/task-a.md"
    printf '# b\n' > "$t/epic-one/story-done/tasks/task-b.md"
    cat > "$t/epic-one/story-draft/OVERVIEW.md" <<'MD'
# Story draft

| Order | Task | Status |
|---|---|---|
| 1 | [`tasks/task-c.md`](tasks/task-c.md) | Designed, at its gate |
MD
    printf '# c\n' > "$t/epic-one/story-draft/tasks/task-c.md"
    cat > "$t/epic-two/README.md" <<'MD'
# Epic two

| # | Story | Status |
|---|---|---|
| 1 | [`only-story`](only-story/) | **Done** |
MD
    printf '# only\n' > "$t/epic-two/only-story/OVERVIEW.md"
    mkdir -p "$work/debts/debt-paid" "$work/debts/debt-open"
    printf '# Debt: paid\n\n| | |\n|---|---|\n| **Status** | **Paid**, in the change that recorded it |\n' > "$work/debts/debt-paid/OVERVIEW.md"
    printf '# Debt: open\n\n| | |\n|---|---|\n| **Status** | Open |\n' > "$work/debts/debt-open/OVERVIEW.md"
}

run_state() {
    rm -rf "$work/store"
    ( cd "$work" && BD_FAKE_STORE="$work/store" MIGRATE_ROOT="$work/tree" MIGRATE_DEBTS="$work/debts" \
        MIGRATE_DEBT_MAP="debt-paid=defect,debt-open=hotfix" bash "$SCRIPT" "$@" >"$work/out" 2>&1 )
    echo "$?"
}

# What the store holds for the item whose title is $1: "<state>|<reason>|<type>|<labels>".
item() {
    local f id
    f="$(grep -lx -- "$1" "$work/store"/*.title 2>/dev/null | head -1)"
    [ -n "$f" ] || { echo "absent"; return; }
    id="$(basename "$f" .title)"
    if [ -f "$work/store/$id.closed" ]; then printf 'closed|%s' "$(cat "$work/store/$id.closed")"; else printf 'open|'; fi
    printf '|%s|%s\n' "$(cat "$work/store/$id.type")" "$(cat "$work/store/$id.labels")"
}

make_state_tree
check "--plan writes nothing" "$(run_state --plan; ls "$work/store" 2>/dev/null | wc -l)" "$(printf '0\n0')"
check "--plan deletes nothing" "$(find "$work/tree" "$work/debts" -name '*.md' | wc -l)" "10"
check "--plan lists an unrecognised status under its own heading" \
    "$(sed -n '/not recognised/,$p' "$work/out" | grep -c 'Draft\|Designed, at its gate')" "2"

make_state_tree
check "a tree with state migrates" "$(run_state)" "0"
check "a task under the Repo-shaped table, Done with a PR, is closed with the cell" \
    "$(item task-a)" "closed|Done — #25|task|"
check "a task Shipped in #N is closed with the cell" "$(item task-b)" "closed|Shipped in #123|task|"
check "a story whose status is bold Shipped is closed, bold removed" \
    "$(item story-done)" "closed|Shipped — both tasks|feature|"
check "a Draft story stays open" "$(item story-draft)" "open||feature|"
check "a task Designed, at its gate stays open" "$(item task-c)" "open||task|"
check "an epic with an open story stays open" "$(item epic-one)" "open||epic|"
check "an epic whose every story is closed is closed" \
    "$(item epic-two)" "closed|every story under it is closed|epic|"
check "a paid debt is a closed bug with its kind" \
    "$(item debt-paid)" "closed|Paid, in the change that recorded it|bug|defect"
check "an open debt is an open bug with its kind" "$(item debt-open)" "open||bug|hotfix"
check "and the debts' files are gone with the rest" "$(find "$work/debts" -name '*.md' | wc -l)" "0"

make_state_tree
mkdir -p "$work/debts/debt-unmapped"; printf '# Debt\n\n| **Status** | Open |\n' > "$work/debts/debt-unmapped/OVERVIEW.md"
check "a debt missing from the map stops the run" "$([ "$(run_state)" = "0" ] && echo no || echo yes)" "yes"
check "before anything is created" "$(ls "$work/store" 2>/dev/null | wc -l)" "0"
check "and it is named" "$(grep -c 'debt-unmapped' "$work/out")" "1"
check "and nothing is deleted" "$(find "$work/tree" "$work/debts" -name '*.md' | wc -l)" "11"

make_state_tree
# story-done is Shipped; give it a task whose row is not finished.
printf '# d\n' > "$work/tree/epic-one/story-done/tasks/task-d.md"
printf '| 3 | [`tasks/task-d.md`](tasks/task-d.md) | extension | Draft |\n' >> "$work/tree/epic-one/story-done/OVERVIEW.md"
check "a finished story with an unfinished task stops the run" "$([ "$(run_state)" = "0" ] && echo no || echo yes)" "yes"
check "before anything is created" "$(ls "$work/store" 2>/dev/null | wc -l)" "0"
check "naming both" "$(grep -c 'story-done is finished but its task task-d is not' "$work/out")" "1"

echo
if [ "$failures" -eq 0 ]; then
    echo "migrate-planning.test: all checks passed."
else
    echo "migrate-planning.test: $failures failed." >&2
    exit 1
fi
