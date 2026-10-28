#!/usr/bin/env bash
# Exercises needs-tracker, the real script: the refusal every ceremony runs as
# its first step (story the-image-delivers-the-agents-skills).
#
# Wrong in either direction is the failure. Refusing a project with the tracker
# on leaves the developer with no ceremonies and a message that blames them;
# letting one without it through runs a daily over a tracker that is not there,
# and what the agent says then will not name the cause.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/needs-tracker"

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
manifest="$work/.agent-container.stack.json"

run() {
    local code=0
    AGENT_MANIFEST="$manifest" bash "$SCRIPT" > "$work/out" 2>&1 || code=$?
    echo "$code"
}

printf '{"stacks": ["node"], "beads": true}' > "$manifest"
check "the tracker on: it passes" "$(run)" "0"
check "and says nothing" "$(wc -c < "$work/out" | tr -d ' ')" "0"

for case in 'off|{"beads": false}' 'no key|{"stacks": ["node"]}' 'the string "true" is not true|{"beads": "true"}'; do
    name="${case%%|*}"; printf '%s' "${case#*|}" > "$manifest"
    check "$name: it refuses" "$(run)" "1"
    check "$name: in one line" "$(wc -l < "$work/out" | tr -d ' ')" "1"
    check "$name: saying how to turn it on" "$(grep -c '"beads": true' "$work/out")" "1"
done

rm -f "$manifest"
check "no manifest: it refuses" "$(run)" "1"
check "naming the file it looked for" "$(grep -c "$manifest" "$work/out")" "1"

printf '{"beads": tru' > "$manifest"
check "a malformed manifest: it refuses" "$(run)" "1"
check "saying it could not read it, not that the tracker is off" \
    "$(grep -c 'could not read' "$work/out") $(grep -c '"beads": true' "$work/out")" "1 0"

if [ "$failures" -gt 0 ]; then
    echo "needs-tracker.test: $failures failure(s)"
    exit 1
fi
echo "needs-tracker.test: only \"beads\": true lets a ceremony run; anything else is refused in one line that names the cause."
