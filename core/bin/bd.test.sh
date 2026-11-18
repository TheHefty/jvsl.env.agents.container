#!/usr/bin/env bash
# Exercises core/bin/bd.sh, the wrapper installed as /usr/local/bin/bd, against
# a stand-in for the real binary. Debt
# a-task-can-be-closed-without-the-reviews-acceptance (gh-363), task asi.1.
#
# On 2026-11-11 the agent closed twelve tasks with a plain `bd close` after
# their pull requests merged, and none had been accepted at a review. The gate
# was a sentence. This holds the wrapper to being one: a task closes only when
# it is accepted, a rejected proposal, dropped with a reason, or a published
# study topic — and the wrapper changes nothing else bd does.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER="$HERE/bd.sh"

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

# The real bd, stood in: every call is recorded, one per line, arguments joined
# by a tab. `show <id> --json` answers from items/<id>, or fails the way bd
# does when the file says so; anything else prints a marker and exits $REAL_RC.
cat > "$work/bd-real" <<'SH'
#!/usr/bin/env bash
(IFS=$'\t'; echo "$*") >> "$CALLS"
if [ "$1" = show ]; then
    f="$ITEMS/$2"
    [ -f "$f" ] || { echo "Error: no issue found matching \"$2\"" >&2; exit 1; }
    if [ "$(head -c 5 "$f")" = "FAIL:" ]; then cut -c6- "$f" >&2; exit 1; fi
    cat "$f"; exit 0
fi
printf 'real bd ran:'; printf ' <%s>' "$@"; printf '\n'
exit "${REAL_RC:-0}"
SH
chmod +x "$work/bd-real"

item() { # item <id> <type> [label...]
    local id="$1" type="$2"; shift 2
    local labels; labels="$(printf '%s\n' "$@" | jq -R . | jq -sc 'map(select(. != ""))')"
    printf '[{"id":"%s","issue_type":"%s","status":"in_progress","labels":%s}]\n' "$id" "$type" "$labels" > "$work/items/$id"
}

run() { # run <bd args...> -> echoes the exit code; output in $work/out
    : > "$work/calls"
    BD_REAL="$work/bd-real" CALLS="$work/calls" ITEMS="$work/items" \
        bash "$WRAPPER" "$@" > "$work/out" 2>&1
    echo "$?"
}
closed() { grep -cE $'(^|\t)(close|done)\t|\t--status\tclosed|\t-s\tclosed|--status=closed' "$work/calls" || true; }
out() { cat "$work/out"; }

item t-plain task
item t-accepted task accepted
item t-proposed task proposed
item t-dropped task dropped
item t-study task study
item e-epic epic
item b-debt bug defect

# --- the gate --------------------------------------------------------------------
check "a task nobody accepted is refused" "$(run close t-plain --reason 'merged in #12')" "1"
check "and the real bd is never asked to close it" "$(closed)" "0"
check "the refusal names the task and the review as the way" \
    "$(out | grep -F 't-plain' | grep -F 'review' | grep -cF 'not accepted')" "1"
check "it says how to abandon one honestly" "$(out | grep -cF 'review-drop')" "1"

check "--force does not get past it" "$(run close t-plain --force)" "1"
check "nor does the alias done" "$(run 'done' t-plain)" "1"
check "nor closing through update --status closed" "$(run update t-plain --status closed)" "1"
check "nor -s closed" "$(run update t-plain -s closed)" "1"
check "nor --status=closed" "$(run update t-plain --status=closed)" "1"
check "and none of them reached the real close" "$(closed)" "0"

for id in t-accepted t-proposed t-dropped t-study; do
    check "$id closes" "$(run close "$id" --reason "why")" "0"
    check "  through the real bd, with the arguments as given" \
        "$(grep -cxF "$(printf 'close\t%s\t--reason\twhy' "$id")" "$work/calls")" "1"
done

# Stories, debts and epics are task asi.2's; this one gates tasks only.
check "a debt is not this gate's" "$(run close b-debt --reason 'fixed')" "0"
check "nor an epic" "$(run close e-epic)" "0"

# --- failure 1: what is an id and what is a flag's value -------------------------
item 'João' task
check "a global flag's value before the subcommand is not the subcommand" \
    "$(run --actor 'João Lima' close t-accepted -r 'merged')" "0"
check "  and the close went through" "$(closed)" "1"
check "a reason's value is not an id" "$(run close t-accepted --reason 'João')" "0"
check "-r's value is not an id either" "$(run close t-accepted -r João)" "0"
check "--reason-file's value is not an id" "$(run close t-accepted --reason-file /dev/null)" "0"
check "global flags before the subcommand still gate it" "$(run --json -q close t-plain)" "1"
check "-C's value is not the subcommand" "$(run -C /tmp close t-plain)" "1"
check "a close with no id is refused rather than closing whatever was touched last" \
    "$(run close --reason 'x')" "1"
check "  naming why" "$(out | grep -ciF 'no id')" "1"

# --- failure 2: everything else is bd, untouched ---------------------------------
check "another command passes through with its exit code" "$(REAL_RC=3 run list --json --status open)" "3"
check "  with its arguments exactly as given" "$(out)" "real bd ran: <list> <--json> <--status> <open>"
check "  and nothing asked of the tracker first" "$(grep -c '^show' "$work/calls" || true)" "0"
check "an update that does not close passes through" "$(run update t-plain --status in_progress)" "0"
check "  untouched" "$(out)" "real bd ran: <update> <t-plain> <--status> <in_progress>"
check "an argument with spaces and quotes survives" "$(run create 'a "quoted" title' --json)" "0"
check "  intact" "$(out)" "real bd ran: <create> <a \"quoted\" title> <--json>"
check "an allowed close returns the real bd's exit code" "$(REAL_RC=4 run close t-accepted)" "4"

# Help closes nothing: the image test asks `bd close --help` of every bd
# command the rules name, and the first CI run of this wrapper refused it.
for h in --help -h; do
    check "close $h is bd's help, not a close with no id" "$(run close "$h")" "0"
    check "  handed to the real bd as given" "$(out)" "real bd ran: <close> <$h>"
done
check "update $(printf %s '--help') with --status closed is help too" "$(run update --help --status closed)" "0"

# --- failure 3: several ids close all or none ------------------------------------
check "one refused id among several refuses the whole close" "$(run close t-accepted t-plain t-dropped)" "1"
check "  and closes none of them" "$(closed)" "0"
check "  naming the one that was refused" "$(out | grep -cF 't-plain')" "1"

# --- the tracker cannot be read ---------------------------------------------------
printf 'FAIL:Error: database is locked\n' > "$work/items/t-locked"
check "a tracker that cannot answer refuses the close" "$(run close t-locked)" "1"
check "  quoting bd's own error" "$(out | grep -cF 'database is locked')" "1"
check "  and closes nothing" "$(closed)" "0"
check "an id that does not exist is refused, quoting bd" "$(run close t-nope)" "1"
check "  with bd's words" "$(out | grep -cF 'no issue found')" "1"

# --- the real binary is missing ---------------------------------------------------
code="$(BD_REAL="$work/absent" bash "$WRAPPER" list > "$work/out" 2>&1; echo $?)"
check "a missing real bd is said, with its path" "$code $(grep -cF "$work/absent" "$work/out")" "127 1"

if [ "$failures" -gt 0 ]; then
    echo "bd.test: $failures failure(s)"
    exit 1
fi
echo "bd.test: a task closes only when accepted, proposed, dropped or a study topic, all or none, and every other bd call is untouched."
