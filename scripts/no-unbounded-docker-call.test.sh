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

# The mechanism has to find a call that is really there. Since the epic
# a-windows-editor-opens-a-project-that-lives-in-wsl, docker is spawned as
# `run(command, argv)` from dockerArgv — `docker`, or `wsl.exe ... docker` —
# so what is really there is the helper's own callers in docker.ts.
if ! grep -qE "dockerBounded\(args, ms," src/host/docker.ts; then
    echo "no-unbounded-docker-call: FAIL: docker.ts no longer calls dockerBounded from dockerFor and \
localDocker. The mechanism this check reads is gone." >&2
    exit 1
fi
echo "ok      the search mechanism finds the helper's real callers"

# No docker spawned directly: a literal run('docker', ...) is unbounded and runs
# on this machine whatever the project's location.
hits="$(grep -nE "(^|[^a-zA-Z])run\('docker'" -- "${sources[@]}" \
    | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' || true)"
if [ -n "$hits" ]; then
    echo "no-unbounded-docker-call: FAIL: these spawn docker directly, without a time limit and \
always on this machine. If the daemon does not answer the call does not return — on the activation \
path that leaves the extension in 'Activating…' — and a WSL project's docker is never reached:" >&2
    printf '%s\n' "$hits" | sed 's/^/        /' >&2
    echo "        Use dockerFor(project) or localDocker from src/host/docker.ts." >&2
    exit 1
fi
echo "ok      nothing spawns docker directly"

# dockerBounded itself only inside docker.ts: called raw elsewhere it takes the
# local default, and a project in a WSL distro would be asked of Windows'
# docker without anything failing.
hits="$(grep -nE "(^|[^a-zA-Z])dockerBounded\(" -- "${sources[@]}" \
    | grep -v '^src/host/docker.ts:' \
    | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' || true)"
if [ -n "$hits" ]; then
    echo "no-unbounded-docker-call: FAIL: these call dockerBounded directly, outside docker.ts, so \
they run docker on this machine whatever the project's location:" >&2
    printf '%s\n' "$hits" | sed 's/^/        /' >&2
    echo "        Use dockerFor(project), or localDocker where no project is known." >&2
    exit 1
fi
echo "ok      every docker call goes through dockerFor or localDocker"

echo
echo "no-unbounded-docker-call.test: 4 passed, 0 failed."
