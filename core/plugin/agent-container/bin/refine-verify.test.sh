#!/usr/bin/env bash
# Exercises refine-verify, the real script, against a stand-in bd that keeps
# its items as files, so a test reads what the tracker holds afterwards rather
# than only what was asked of it.
#
# Debt a-task-can-be-closed-without-the-reviews-acceptance (gh-363), task asi.2.
# On 2026-11-11 a debt was closed by the agent as soon as its last task merged,
# and nobody had verified it live. bd now refuses to close a story or a debt
# without the verified label; refine-verify is the one way that sets it, on the
# developer's yes and in their words, and closes in the same step.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/refine-verify"

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
mkdir -p "$work/items"

# items/<id> is the item as `bd show --json` prints it; items/<id>.children is
# what `bd list --parent <id> --status all --json` prints. `label add|remove`
# rewrites the item; `close` sets it closed with its reason, or fails with
# $CLOSE_FAIL and changes nothing, the way the wrapper refusing would.
cat > "$work/bd" <<'SH'
#!/usr/bin/env bash
(IFS=$'\t'; echo "$*") >> "$CALLS"
f="$ITEMS/${2:-}"
case "$1" in
    show) [ -f "$f" ] || { echo "Error: no issue found matching \"$2\"" >&2; exit 1; }; cat "$f" ;;
    list) c="$ITEMS/$3.children"; if [ -f "$c" ]; then cat "$c"; else echo '[]'; fi ;;
    label)
        f="$ITEMS/$3"
        case "$2" in
            add) jq -c --arg l "$4" '.[0].labels = ((.[0].labels // []) + [$l])' "$f" > "$f.new" ;;
            remove) jq -c --arg l "$4" '.[0].labels = ((.[0].labels // []) - [$l])' "$f" > "$f.new" ;;
        esac
        mv "$f.new" "$f" ;;
    close)
        [ -n "${CLOSE_FAIL:-}" ] && { echo "$CLOSE_FAIL" >&2; exit 1; }
        jq -c --arg r "$4" '.[0].status = "closed" | .[0].close_reason = $r' "$f" > "$f.new" && mv "$f.new" "$f" ;;
esac
SH
chmod +x "$work/bd"

item() { # item <id> <type> <status> [label...]
    local id="$1" type="$2" status="$3"; shift 3
    local labels; labels="$(printf '%s\n' "$@" | jq -R . | jq -sc 'map(select(. != ""))')"
    printf '[{"id":"%s","issue_type":"%s","status":"%s","labels":%s}]\n' "$id" "$type" "$status" "$labels" > "$work/items/$id"
}
run() { # run <args...> -> echoes the exit code; output in $work/out
    : > "$work/calls"
    CALLS="$work/calls" ITEMS="$work/items" REVIEW_BD="$work/bd" bash "$SCRIPT" "$@" > "$work/out" 2>&1
    echo "$?"
}
field() { jq -r ".[0].$2 // \"-\"" "$work/items/$1"; }
labels() { jq -r '.[0].labels | join(",")' "$work/items/$1"; }
writes() { grep -cE '^(label|close|update)' "$work/calls" || true; }

# --- the developer said yes ---------------------------------------------------
item story feature open
echo '[{"id":"story.1","status":"closed"}]' > "$work/items/story.children"
check "a story whose tasks are done is verified" "$(run story 'clicked through it on the 2.2.1 vsix')" "0"
check "  labelled verified" "$(labels story)" "verified"
check "  and closed, with how it was verified as the reason" \
    "$(field story status) | $(field story close_reason)" "closed | Verified: clicked through it on the 2.2.1 vsix"
check "  labelled before the close, so the gate lets it through" \
    "$(grep -E '^(label|close)' "$work/calls" | cut -f1 | tr '\n' ' ')" "label close "
check "  and it says so" "$(grep -cF 'story: verified and closed' "$work/out")" "1"

item debt bug in_progress defect
check "a debt is verified the same way" "$(run debt 'kotodori rebuilt, the proxy writes its cache') $(field debt status)" "0 closed"
check "  keeping its own labels" "$(labels debt)" "defect,verified"

# --- what it refuses, writing nothing ------------------------------------------
item s2 feature open
check "no words on how it was verified is refused" "$(run s2 '   ') $(writes)" "1 0"
check "  saying the developer's words are what it needs" "$(grep -ciF 'how it was verified' "$work/out")" "1"
check "no arguments at all is a usage error" "$(run) $(writes)" "2 0"
item t1 task in_progress
check "a task is refused" "$(run t1 'x') $(writes)" "1 0"
check "  naming the review as its way" "$(grep -cF 'review' "$work/out")" "1"
item e1 epic open
check "an epic is refused" "$(run e1 'x') $(writes)" "1 0"
check "  naming bd close as its way, once its children are closed" "$(grep -cF 'bd close' "$work/out")" "1"
item p1 feature deferred proposed
check "a proposal is refused: it is rejected, not verified" "$(run p1 'x') $(writes)" "1 0"
check "  naming refine-reject" "$(grep -cF 'refine-reject' "$work/out")" "1"
item done1 feature closed verified
check "a closed one is refused" "$(run done1 'x') $(writes)" "1 0"
check "an id the tracker does not have is refused, quoting bd" "$(run ghost 'x') $(writes) $(grep -cF 'no issue found' "$work/out")" "1 0 1"
item busy feature open
echo '[{"id":"busy.1","status":"closed"},{"id":"busy.2","status":"in_progress"}]' > "$work/items/busy.children"
check "a story with a task still open is refused" "$(run busy 'x') $(writes)" "1 0"
check "  naming the open task" "$(grep -c 'busy\.2' "$work/out") $(grep -c 'busy\.1' "$work/out")" "1 0"

# --- a close that fails leaves no label behind -----------------------------------
item s3 feature open
check "a close bd refuses fails the verification" "$(CLOSE_FAIL='Error: database is locked' run s3 'x')" "1"
check "  the item stays open" "$(field s3 status)" "open"
check "  and the label is taken back, so the gate is not left open" "$(labels s3)" ""
check "  quoting bd" "$(grep -cF 'database is locked' "$work/out")" "1"

if [ "$failures" -gt 0 ]; then
    echo "refine-verify.test: $failures failure(s)"
    exit 1
fi
echo "refine-verify.test: a story or a debt is labelled verified and closed in one step, with the developer's words, and anything else is refused writing nothing."
