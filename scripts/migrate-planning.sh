#!/usr/bin/env bash
# Moves every epic, story and task into the tracker and deletes its document.
#
# **The order is the whole safety property.** Create everything, read every
# item back, compare it to the file it came from, and only then delete. A
# half-done migration that deleted as it went would lose the documents whose
# items failed — and `bd create` exiting 0 is not evidence that a body arrived
# whole.
#
# **The comparison is exact after one named transformation.** `bd` strips the
# trailing newline and changes nothing else: measured against the real binary,
# an 11,569-byte document comes back as 11,568, identical otherwise. So the
# file's content with trailing newlines removed must equal what the tracker
# returns, and any other difference fails the run. A check loosened past that —
# trimming whitespace, comparing lengths — would be unable to see the defect
# this script exists to prevent.
#
# **One list, built once.** The deletion walks what was migrated rather than the
# directory, so a file that appeared between the passes is not deleted without
# having been carried.
#
# See docs/PLANNING/beads-tracks-the-work/the-work-items-move-into-the-tracker/.
set -euo pipefail

PLAN_ONLY=""
[ "${1:-}" = "--plan" ] && PLAN_ONLY=1

ROOT="${MIGRATE_ROOT:-docs/PLANNING}"
DEBTS="${MIGRATE_DEBTS:-docs/DEBTS}"
[ -d "$ROOT" ] || { echo "migrate-planning: no $ROOT to migrate." >&2; exit 1; }

# **A debt's kind, mapped by hand.** Its kind is free text in the files, so it
# is never guessed: approved by the operator on 2026-10-06, and extended with
# the debts recorded since. A debt missing from this map stops the run before
# anything is created. MIGRATE_DEBT_MAP replaces it, for the test.
DEBT_MAP="${MIGRATE_DEBT_MAP:-a-markdown-change-runs-the-whole-suite=defect,agent-state-directory-is-lost-under-the-mount=defect,forwarded-secrets-land-in-the-sandbox-argv=hotfix,six-build-time-fetches-verify-nothing=defect,the-sandbox-under-apparmor=defect,the-panel-reads-the-containers-path=defect,bd-reports-usage-by-default=defect,the-size-check-test-races-git=defect}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# --- the plan, built once, before anything is written -----------------------
#
# One row per item: kind, path, parent key, state, reason, labels, title.
# **Separated by \x1f, not a tab**: bash's read treats a tab as whitespace and
# collapses empty fields, so a row with no parent or no labels shifted every
# column after it.
# **State is read from the parent's table** (agreed by the operator on
# 2026-10-07): a Status cell starting with Done or Shipped, bold or not, closes
# the item with the cell as its reason; anything else leaves it open and listed.
# The column is found by its header, because three table shapes exist. An epic
# is closed when every story under it is. A debt's state is its own Status row:
# Paid closes it.
plan="$work/plan"
python3 - "$ROOT" "$DEBTS" "$DEBT_MAP" > "$plan" <<'PYPLAN'
import os, re, sys
root, debts, raw_map = sys.argv[1], sys.argv[2], sys.argv[3]
kinds = dict(pair.split("=", 1) for pair in raw_map.split(",") if pair)

def rows(path):
    """(link target, status) for each row of each table with a Status column."""
    out, status_at, lines = [], None, open(path, encoding="utf-8").read().splitlines()
    for line in lines:
        if not line.startswith("|"):
            status_at = None
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if status_at is None:
            lowered = [c.lower() for c in cells]
            status_at = lowered.index("status") if "status" in lowered else -1
            continue
        if status_at < 0 or set("".join(cells)) <= set("-: "):
            continue
        link = re.search(r"\]\(([^)]+)\)", cells[1] if len(cells) > 1 else "")
        if link and status_at < len(cells):
            out.append((link.group(1).rstrip("/"), cells[status_at].replace("**", "").strip()))
    return out

def finished(status):
    return re.match(r"^(Done|Shipped)\b", status) is not None

def emit(*cols):
    print("\x1f".join(c.replace("\x1f", " ").replace("\n", " ") for c in cols))

for epic in sorted(d for d in os.listdir(root) if os.path.isfile(os.path.join(root, d, "README.md"))):
    epic_readme = os.path.join(root, epic, "README.md")
    story_status = {os.path.basename(t): s for t, s in rows(epic_readme)}
    stories = sorted(d for d in os.listdir(os.path.join(root, epic))
                     if os.path.isfile(os.path.join(root, epic, d, "OVERVIEW.md")))
    closed_stories = [s for s in stories if finished(story_status.get(s, ""))]
    if stories and len(closed_stories) == len(stories):
        emit("epic", epic_readme, "", "closed", "every story under it is closed", "", epic)
    else:
        emit("epic", epic_readme, "", "open", f"{len(stories) - len(closed_stories)} of {len(stories)} stories not finished", "", epic)
    for story in stories:
        overview = os.path.join(root, epic, story, "OVERVIEW.md")
        st = story_status.get(story, "")
        emit("story", overview, epic, "closed" if finished(st) else "open", st or "no row in the epic's table", "", story)
        task_status = {t: s for t, s in rows(overview)}
        tasks_dir = os.path.join(root, epic, story, "tasks")
        for task in sorted(os.listdir(tasks_dir)) if os.path.isdir(tasks_dir) else []:
            if not task.endswith(".md"):
                continue
            ts = task_status.get(f"tasks/{task}", "")
            emit("task", os.path.join(tasks_dir, task), f"{epic}/{story}",
                 "closed" if finished(ts) else "open", ts or "no row in the story's table", "", task[:-3])

unmapped = []
if os.path.isdir(debts):
    for slug in sorted(os.listdir(debts)):
        path = os.path.join(debts, slug, "OVERVIEW.md")
        if not os.path.isfile(path):
            continue
        if slug not in kinds:
            unmapped.append(slug)
            continue
        status = ""
        for line in open(path, encoding="utf-8"):
            m = re.match(r"^\|\s*\*\*Status\*\*\s*\|(.*)\|\s*$", line)
            if m:
                status = m.group(1).replace("**", "").strip()
                break
        emit("debt", path, "", "closed" if status.startswith("Paid") else "open", status or "no Status row", kinds[slug], slug)
if unmapped:
    print("UNMAPPED\x1f" + " ".join(unmapped))
PYPLAN

if grep -q '^UNMAPPED' "$plan"; then
    echo "migrate-planning: these debts have no kind in the map, and a kind is never guessed: \
$(grep '^UNMAPPED' "$plan" | cut -d$'\x1f' -f2). Add each to DEBT_MAP in this script. Nothing was created." >&2
    exit 1
fi

count="$(wc -l < "$plan")"
[ "$count" -gt 0 ] || { echo "migrate-planning: nothing to migrate under $ROOT." >&2; exit 1; }

# --- the plan, said before anything is written ------------------------------
{
    echo "migrate-planning: $count document(s) to carry."
    echo
    echo "== debts"
    awk -F'\x1f' '$1 == "debt" { printf "  %-7s %-8s %s  (%s)\n", $4, $6, $7, $5 }' "$plan"
    echo
    echo "== closed: the status says the work is finished"
    awk -F'\x1f' '$1 != "debt" && $4 == "closed" { printf "  %-5s %s  (%s)\n", $1, $7, $5 }' "$plan"
    echo
    echo "== left open: status not recognised as finished — read these before the real run"
    awk -F'\x1f' '$1 != "debt" && $4 == "open" { printf "  %-5s %s  (%s)\n", $1, $7, $5 }' "$plan"
    echo
}
[ -z "$PLAN_ONLY" ] || exit 0

# --- create, remembering which id each document got ------------------------

ids="$work/ids"   # parent-key<TAB>id, so a child can find its parent's id
: > "$ids"

id_for() { awk -F'\t' -v k="$1" '$1 == k { print $2; exit }' "$ids"; }

while IFS=$'\x1f' read -r kind path parent state reason labels title; do
    args=(--type task)
    [ "$kind" = epic ] && args=(--type epic)
    [ "$kind" = story ] && args=(--type feature)
    [ "$kind" = debt ] && args=(--type bug --labels "$labels")

    if [ -n "$parent" ]; then
        pid="$(id_for "$parent")"
        [ -n "$pid" ] || { echo "migrate-planning: no id for parent '$parent' of $path." >&2; exit 1; }
        args+=(--parent "$pid")
    fi

    # A story's scenarios travel with it, in the field the tool has for them.
    if [ "$kind" = story ]; then
        feature="$(dirname "$path")/$(basename "$(dirname "$path")").feature"
        [ -f "$feature" ] && args+=(--acceptance "$(cat "$feature")")
    fi

    out="$(bd create "$title" --description "$(cat "$path")" "${args[@]}" --json)"
    id="$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"

    case "$kind" in
        epic)  printf '%s\t%s\n' "$(basename "$(dirname "$path")")" "$id" >> "$ids" ;;
        story) printf '%s/%s\t%s\n' "$parent" "$(basename "$(dirname "$path")")" "$id" >> "$ids" ;;
    esac
    printf '%s\t%s\n' "$path" "$id" >> "$work/created"
    [ "$state" = closed ] && printf '%s\t%s\n' "$id" "$reason" >> "$work/to-close"
done < "$plan"

echo "migrate-planning: $(wc -l < "$work/created") item(s) created."

# --- read every one back before deleting anything --------------------------

bad=0
while IFS=$'\t' read -r path id; do
    back="$(bd show "$id" --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["description"], end="")')"
    want="$(python3 -c 'import sys; print(open(sys.argv[1]).read().rstrip("\n"), end="")' "$path")"
    if [ "$back" != "$want" ]; then
        echo "migrate-planning: $id does not match $path" >&2
        echo "    file:    ${#want} bytes after stripping trailing newlines" >&2
        echo "    tracker: ${#back} bytes" >&2
        bad=$((bad + 1))
    fi
done < "$work/created"

if [ "$bad" -gt 0 ]; then
    echo "migrate-planning: $bad item(s) did not come back whole. Nothing was deleted — the \
documents are still the only readable copy, which is the point of checking before removing." >&2
    exit 1
fi
echo "migrate-planning: every item came back whole."

# --- what is finished is closed, with the status that said so ---------------

if [ -f "$work/to-close" ]; then
    while IFS=$'\t' read -r id reason; do
        bd close "$id" --reason "$reason" >/dev/null
    done < "$work/to-close"
    echo "migrate-planning: $(wc -l < "$work/to-close") item(s) closed."
fi

# --- and only now, the deletion -------------------------------------------

while IFS=$'\t' read -r path _; do
    rm -f "$path"
    feature="$(dirname "$path")/$(basename "$(dirname "$path")").feature"
    [ -f "$feature" ] && rm -f "$feature"
    rmdir "$(dirname "$path")" 2>/dev/null || true
done < "$work/created"

echo "migrate-planning: $count document(s) carried and removed."
