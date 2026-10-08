#!/usr/bin/env bash
# No call to docker runs without a time limit.
#
# **Because an unbounded one hangs activation, and a hung activation is every
# command reporting that it does not exist.** Observed on 2026-10-06: the
# editor's Running Extensions view showed `Agent Containers 0.3.0 — Activating…`
# for ever while every palette entry answered
#
#     command 'jvsl.agentContainer.build' not found
#
# which is what the editor says when it activates an extension to dispatch a
# command and the activation never finishes. Not a crash — a wait.
#
# **The lesson was already learned once and applied in one place.** `docker
# info` was raced against a timeout because it "hangs on an unreachable daemon
# rather than failing", in the words of its own comment; `docker image inspect`
# and `docker ps` were left unbounded, and both run inside the activation path.
# A mechanism applied where somebody remembered is not a mechanism.
#
# This environment runs a nested rootless daemon, which is markedly easier to
# leave unresponsive than an ordinary one.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${DOCKER_TIMEOUT_GUARD_ROOT:-$(cd "$HERE/.." && pwd)}"
cd "$ROOT"

mapfile -t sources < <(git ls-files 'src/*.ts' | grep -vE '\.test\.ts$' | sort)

if [ "${#sources[@]}" -lt 5 ]; then
    echo "no-unbounded-docker-call: FAIL: found only ${#sources[@]} source file(s); this check is \
not reading the tree it thinks it is and would pass vacuously." >&2
    exit 1
fi
echo "ok      ${#sources[@]} source file(s) to check"

# The mechanism has to find a call that is really there.
if ! grep -qE "run\('docker'" -- "${sources[@]}"; then
    echo "no-unbounded-docker-call: FAIL: no call to docker anywhere under src/, which cannot be \
true while the extension drives the host's. The mechanism is broken." >&2
    exit 1
fi
echo "ok      the search mechanism finds a docker call that is really there"

# Every one must go through the helper that bounds it. Naming the helper rather
# than looking for `Promise.race` nearby: a race three lines above a second call
# is exactly the shape that passed review and hung anyway.
# The helper itself is the one call that may be direct — it is what applies the
# limit. Exempted by being inside its body rather than by a pattern: a pattern
# would exempt the next function that happened to look like it.
helper_line="$(grep -n 'async function dockerBounded' src/host/docker.ts | cut -d: -f1)"
helper_end=$(( ${helper_line:-0} + 8 ))

hits="$(grep -nE "(^|[^a-zA-Z])run\('docker'" -- "${sources[@]}" \
    | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' \
    | awk -F: -v s="${helper_line:-0}" -v e="$helper_end" \
        '!($1 == "src/host/docker.ts" && $2 > s && $2 < e)' || true)"

if [ -n "$hits" ]; then
    echo "no-unbounded-docker-call: FAIL: these call docker without a time limit. If the daemon \
does not answer, the call does not return — and the ones on the activation path leave the extension \
in 'Activating…' with every command reporting that it does not exist:" >&2
    printf '%s\n' "$hits" | sed 's/^/        /' >&2
    echo "        Call it through dockerBounded(), which races it against DOCKER_CHECK_MS." >&2
    exit 1
fi
echo "ok      every docker call goes through the bounded helper"

echo
echo "no-unbounded-docker-call.test: 3 passed, 0 failed."
