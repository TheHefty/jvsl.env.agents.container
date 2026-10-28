# shellcheck shell=bash
# Sourced by daily-brief.test.sh and daily-check.test.sh: builds a `bd export`
# in the shape bd 1.3.1 prints, measured on this repository's tracker on
# 2026-10-28 — one object per line, `labels` null when there are none,
# `acceptance_criteria` absent when empty, dependencies typed `parent-child` or
# `blocks`. core/image.test.sh holds the same reading against the real bd, which
# is what catches this file drifting from it.

# item id type status priority [labels-json] [acceptance] [created] [description] [dependent_count]
item() {
    local id="$1" type="$2" status="$3" prio="$4" labels="${5:-null}" acc="${6:-}" created="${7:-2026-10-01T00:00:00Z}" desc="${8:-}" unblocks="${9:-0}"
    jq -nc --arg id "$id" --arg type "$type" --arg status "$status" --argjson prio "$prio" \
        --argjson labels "$labels" --arg acc "$acc" --arg created "$created" --arg desc "$desc" \
        --argjson unblocks "$unblocks" '
        {id: $id, _type: "issue", issue_type: $type, status: $status, priority: $prio,
         title: ("title of " + $id), description: $desc, labels: $labels,
         created_at: $created, updated_at: $created, dependent_count: $unblocks, dependencies: []}
        + (if $acc == "" then {} else {acceptance_criteria: $acc} end)' >> "$EXPORT"
}

# dep id depends-on type — appended to the item already written.
dep() {
    local tmp
    tmp="$(mktemp)"
    jq -c --arg id "$1" --arg on "$2" --arg type "$3" '
        if .id == $id then .dependencies += [{issue_id: $id, depends_on_id: $on, type: $type}] else . end' \
        "$EXPORT" > "$tmp" && mv "$tmp" "$EXPORT"
}
