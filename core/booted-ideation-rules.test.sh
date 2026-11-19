#!/usr/bin/env bash
# The real core image, booted in ideation mode, installs the ideation rules and
# not the development ones (story the-brainstorm-command-opens-the-ideation-
# container, gh-364; task 5kd.2.3).
#
# The Brainstorm container is the same image with AGENT_CONTAINER_MODE=ideation
# (5kd.2.2). core/cont-init/50-agent-rules.test.sh drives the hook with stand-
# ins; tools/devcontainer-up.test.ts brings the Brainstorm configuration up over
# an alpine, which has no boot. This boots the image the configuration names,
# the way the configuration runs it — a tmpfs over rules/, the mode in the
# environment — and reads what the agent will load. Both modes, so a boot that
# installs IDEATION.md everywhere fails here as much as one that never does.
#
# Split from devcontainer-up on 2026-11-19 so CI builds no extra image: this
# runs in core-booted, beside the other booted tests, on the core-ci it built.
set -euo pipefail

IMAGE="${1:-${CORE_TEST_IMAGE:-core-ci}}"
BOOT_TIMEOUT="${CORE_TEST_BOOT_TIMEOUT:-180}"
NAME="core-ideation-rules-test-$$"
RULES=/config/.claude/rules

# shellcheck source=/dev/null
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/booted.matchers.sh"

fail() { echo "booted-ideation-rules.test: FAIL: $*" >&2; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker image inspect "$IMAGE" >/dev/null 2>&1 \
    || fail "no such image: $IMAGE (pass it as the first argument, or set CORE_TEST_IMAGE). Nothing was pulled"

# installed <mode or empty>: the files the boot left in rules/, sorted, one line.
installed() {
    local mode="$1" deadline
    cleanup
    docker run -d --name "$NAME" --tmpfs "$RULES" \
        -e PUID=1000 -e PGID=1000 ${mode:+-e "AGENT_CONTAINER_MODE=$mode"} \
        "$IMAGE" >/dev/null || fail "the container would not start from $IMAGE"
    deadline=$(( $(date +%s) + BOOT_TIMEOUT ))
    until [ "$(init_count "$(docker logs "$NAME" 2>&1)")" -ge 1 ]; do
        if [ "$(date +%s)" -ge "$deadline" ] || [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" != "true" ]; then
            docker logs "$NAME" 2>&1 | tail -40 >&2
            fail "the boot with AGENT_CONTAINER_MODE=${mode:-<unset>} did not finish; logs above"
        fi
        sleep 2
    done
    docker exec "$NAME" sh -c "ls $RULES" | sort | tr '\n' ' ' | sed 's/ $//'
}

got="$(installed ideation)"
[ "$got" = "IDEATION.md" ] \
    || fail "booted with AGENT_CONTAINER_MODE=ideation, $RULES holds \"$got\", not IDEATION.md alone: the \
Brainstorm container would run under the wrong rules. See core/cont-init/50-agent-rules.sh"
echo "booted-ideation-rules.test: ideation mode installs IDEATION.md alone"

got="$(installed '')"
[ "$got" = "MODES.md RULES.md" ] \
    || fail "booted with no mode, $RULES holds \"$got\", not MODES.md and RULES.md: every project would run \
under the wrong rules"
echo "booted-ideation-rules.test: no mode installs MODES.md and RULES.md, and not IDEATION.md"
