#!/usr/bin/env bash
# Shadows the beads CLI so that closing a task goes through the review, and a
# story or a debt through its verification. Installed
# at /usr/local/bin/bd; the real binary is at /usr/local/lib/jvsl/bd, off PATH.
#
# Debt a-task-can-be-closed-without-the-reviews-acceptance (gh-363). The rules
# say a task is done when the developer accepts it at the review, and closes
# when its pull request merges. On 2026-11-11 the agent closed twelve tasks
# with a plain `bd close` right after their merges, none of them accepted, and
# nothing refused it: the gate was a sentence in RULES.md. This makes it a gate.
#
# A task closes only if it carries one of:
#   accepted  — the review accepted it; review-settle closes it on the merge
#   proposed  — a draft the developer rejected; refine-reject closes it
#   dropped   — abandoned with the developer's yes and a reason; review-drop
#   study     — a study topic, done when its post is published; study-move
# A story (feature) or a debt (bug) closes only if it carries one of:
#   verified  — the developer said it was verified live; refine-verify (asi.2)
#   proposed  — a draft the developer rejected; refine-reject closes it
# On 2026-11-11 a debt was closed as soon as its last task merged, unverified.
# An epic is outside the labels: it closes once none of its children is open,
# as `bd list --parent <id> --status all` reads them.
# Anything else is refused, naming the item and the way through. Several ids
# close all or none. `--force` is bd's own flag for its own gates and does not
# get past this one. A tracker that cannot be read refuses rather than lets
# through: a gate that opens when it cannot see is not a gate.
#
# Every other command is handed to the real binary untouched, by exec, so its
# output, its exit code and its --json are bd's own: the plugin's scripts read
# them. What this does not stop: the real binary called by its absolute path,
# like /usr/bin/claude for the claude wrapper, and `bd delete`, which removes
# rather than closes. The review's own report is what catches a bypass.
set -uo pipefail

REAL="${BD_REAL:-/usr/local/lib/jvsl/bd}"
if [ ! -x "$REAL" ]; then
    echo "bd: the real beads binary is not at $REAL, so nothing was run. The image installs it there; this wrapper is /usr/local/bin/bd." >&2
    exit 127
fi

# Global flags that take a value, so their value is never read as the subcommand.
global_value() { case "$1" in --actor|--database|--db|-C|--directory|--dolt-auto-commit|--mem-profile) return 0 ;; esac; return 1; }

args=("$@")
n=${#args[@]}
i=0
while [ "$i" -lt "$n" ]; do
    a="${args[$i]}"
    case "$a" in
        -*) if global_value "$a"; then i=$((i + 2)); else i=$((i + 1)); fi ;;
        *) break ;;
    esac
done
sub="${args[$i]:-}"
rest=("${args[@]:$((i + 1))}")

# Help closes nothing, whatever else is on the line.
for a in "${rest[@]}"; do
    case "$a" in -h|--help) exec "$REAL" "$@" ;; esac
done

ids=()
case "$sub" in
    close|done)
        # Close's flags that take a value; every other flag is a switch.
        j=0
        while [ "$j" -lt "${#rest[@]}" ]; do
            a="${rest[$j]}"
            case "$a" in
                -r|--reason|--reason-file|--session) j=$((j + 2)) ;;
                -*) j=$((j + 1)) ;;
                *) ids+=("$a"); j=$((j + 1)) ;;
            esac
        done
        ;;
    update)
        closing=no
        for ((j = 0; j < ${#rest[@]}; j++)); do
            case "${rest[$j]}" in
                --status=closed) closing=yes ;;
                --status|-s) [ "${rest[$((j + 1))]:-}" = closed ] && closing=yes ;;
            esac
        done
        [ "$closing" = yes ] || exec "$REAL" "$@"
        # update takes its ids first, before its flags (`bd update <id> [flags]`).
        for a in "${rest[@]}"; do
            case "$a" in -*) break ;; *) ids+=("$a") ;; esac
        done
        ;;
    *) exec "$REAL" "$@" ;;
esac

if [ "${#ids[@]}" -eq 0 ]; then
    echo "bd: refused: no id given to close. Outside a terminal bd refuses that itself; in one it would close whatever was touched last, which no gate can check. Name the id." >&2
    exit 1
fi

refused=0
for id in "${ids[@]}"; do
    err="$(mktemp)"
    if ! shown="$("$REAL" show "$id" --json 2>"$err")"; then
        echo "bd: refused: could not read $id from the tracker, so nothing was closed. bd said: $(tail -n 1 "$err")" >&2
        rm -f "$err"; refused=1; continue
    fi
    rm -f "$err"
    read -r type allowed verified < <(jq -r '(.[0] // .) as $it | ($it.labels // []) as $l
        | "\($it.issue_type // "-") \(if ($l | map(select(. == "accepted" or . == "proposed" or . == "dropped" or . == "study")) | length) > 0 then "yes" else "no" end) \(if ($l | map(select(. == "verified" or . == "proposed")) | length) > 0 then "yes" else "no" end)"' <<<"$shown" 2>/dev/null) \
        || { echo "bd: refused: could not read $id's type and labels from bd's answer, so nothing was closed." >&2; refused=1; continue; }
    case "$type" in
        task)
            if [ "$allowed" != yes ]; then
                echo "bd: refused: $id is a task that was not accepted in review, so nothing was closed. A task closes when the developer accepts it at the review and its pull request merges: review-accept, then review-settle. To abandon it, with the developer's yes and a reason: review-drop $id \"<why>\"." >&2
                refused=1
            fi
            ;;
        feature|bug)
            if [ "$verified" != yes ]; then
                kind=story; [ "$type" = bug ] && kind=debt
                echo "bd: refused: $id is a $kind that was not verified, so nothing was closed. A story or a debt closes when the developer says it was verified live, at the refine's \"Awaiting verification\": refine-verify $id \"<how it was verified>\" labels it verified and closes it." >&2
                refused=1
            fi
            ;;
        epic)
            err="$(mktemp)"
            if ! kids="$("$REAL" list --parent "$id" --status all --json 2>"$err")"; then
                echo "bd: refused: could not read $id's children from the tracker, so nothing was closed. bd said: $(tail -n 1 "$err")" >&2
                rm -f "$err"; refused=1; continue
            fi
            rm -f "$err"
            if ! open="$(jq -r '[.[] | select(.status != "closed") | .id] | join(", ")' <<<"$kids" 2>/dev/null)"; then
                echo "bd: refused: could not read $id's children from bd's answer, so nothing was closed." >&2
                refused=1; continue
            fi
            if [ -n "$open" ]; then
                echo "bd: refused: $id is an epic with children still open ($open), so nothing was closed. An epic closes once none of its stories is open." >&2
                refused=1
            fi
            ;;
    esac
done
[ "$refused" -eq 0 ] || exit 1
exec "$REAL" "$@"
