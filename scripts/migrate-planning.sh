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

ROOT="${MIGRATE_ROOT:-docs/PLANNING}"

[ -d "$ROOT" ] || { echo "migrate-planning: no $ROOT to migrate." >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
manifest="$work/manifest"   # one line per item: kind<TAB>path<TAB>parent-key

# --- the list, built once --------------------------------------------------

: > "$manifest"
for epic in "$ROOT"/*/; do
    [ -f "$epic/README.md" ] || continue
    ekey="$(basename "$epic")"
    printf 'epic\t%s\t\n' "$epic/README.md" >> "$manifest"
    for story in "$epic"*/; do
        [ -f "$story/OVERVIEW.md" ] || continue
        skey="$ekey/$(basename "$story")"
        printf 'story\t%s\t%s\n' "$story/OVERVIEW.md" "$ekey" >> "$manifest"
        for task in "$story"tasks/*.md; do
            [ -f "$task" ] || continue
            printf 'task\t%s\t%s\n' "$task" "$skey" >> "$manifest"
        done
    done
done

count="$(wc -l < "$manifest")"
[ "$count" -gt 0 ] || { echo "migrate-planning: nothing to migrate under $ROOT." >&2; exit 1; }
echo "migrate-planning: $count document(s) to carry."

# --- create, remembering which id each document got ------------------------

ids="$work/ids"   # parent-key<TAB>id, so a child can find its parent's id
: > "$ids"

id_for() { awk -F'\t' -v k="$1" '$1 == k { print $2; exit }' "$ids"; }

while IFS=$'\t' read -r kind path parent; do
    title="$(basename "${path%.md}")"
    [ "$kind" = epic ] && title="$(basename "$(dirname "$path")")"
    [ "$kind" = story ] && title="$(basename "$(dirname "$path")")"

    args=(--type task)
    [ "$kind" = epic ] && args=(--type epic)
    [ "$kind" = story ] && args=(--type feature)

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
done < "$manifest"

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

# --- and only now, the deletion -------------------------------------------

while IFS=$'\t' read -r path _; do
    rm -f "$path"
    feature="$(dirname "$path")/$(basename "$(dirname "$path")").feature"
    [ -f "$feature" ] && rm -f "$feature"
done < "$work/created"

echo "migrate-planning: $count document(s) carried and removed."
