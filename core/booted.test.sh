#!/usr/bin/env bash
# What the image is *after it has started*, which is a different question from
# what the build put in it.
#
# core/image.test.sh runs with --entrypoint, which bypasses s6-overlay
# entirely: nothing a cont-init script writes is visible to it, and neither is
# anything LinuxServer's init rewrites. And it does rewrite 'abc' — that is why
# /etc/subuid is keyed by name rather than by uid (see core/Dockerfile.frag
# section 4). So a build-time change to that user could be undone at every boot
# with every build still green, and nobody would find out until a person opened
# a project.
#
# It is also the only test that can tell "the hook is installed" from "the hook
# is correct": the unit test beside 10-state-ownership.sh is green in a world
# where the script was never copied into /custom-cont-init.d, which is exactly
# the bug 40-ai-memory.sh exists to work around.
#
# **Boots are counted, never timed.** An earlier version filtered the log with
# `docker logs --since` and a timestamp truncated to the second — which includes
# the tail of the previous boot, so the wait returned immediately and every
# assertion after it ran before the hook had. Counting how many times init has
# finished cannot be fooled by a clock.
#
# **Run it against core/booted.test.fixture/ while changing it.** The real image
# cannot be built everywhere, and a mistake in here otherwise costs a full CI
# round trip. Two did.
set -euo pipefail

IMAGE="${1:-${CORE_TEST_IMAGE:-core-ci}}"
USER_NAME="${CORE_TEST_USER:-abc}"
BOOT_TIMEOUT="${CORE_TEST_BOOT_TIMEOUT:-180}"
NAME="core-booted-test-$$"

# The questions asked of a boot's log live beside this file so they can be
# tested without building an image. They have to be: the base image announces
# every custom-init script by filename on every boot, so "the log does not
# mention the hook" is a condition that can never hold — and asserting it is
# what failed the first CI run of these checks, on a boot where the hook had
# printed nothing at all.
# shellcheck source=/dev/null
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/booted.matchers.sh"

fail() { echo "booted.test: FAIL: $*" >&2; exit 1; }
logs() { docker logs "${1:-$NAME}" 2>&1; }

SHADOW="$NAME-shadow"

cleanup() { docker rm -f "$NAME" "$SHADOW" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Checked before `docker run`, because docker's own answer for an image that is
# not here is to try the registry and then report "pull access denied … may
# require docker login" — a permissions story about a repository that was never
# the point.
docker image inspect "$IMAGE" >/dev/null 2>&1 \
    || fail "no such image: $IMAGE (pass it as the first argument, or set CORE_TEST_IMAGE). \
Nothing was pulled: this test asserts what a locally built image does on boot"

# Waits until init has finished $1 times, i.e. for the $1-th boot.
wait_for_boot() {
    local want="$1" who="${2:-$NAME}" deadline
    deadline=$(( $(date +%s) + BOOT_TIMEOUT ))
    while [ "$(init_count "$(logs "$who")")" -lt "$want" ]; do
        if [ "$(date +%s)" -ge "$deadline" ]; then
            echo "--- container logs ---" >&2; logs "$who" | tail -40 >&2
            fail "boot $want of $who did not finish within ${BOOT_TIMEOUT}s; logs above"
        fi
        if [ "$(docker inspect -f '{{.State.Running}}' "$who" 2>/dev/null)" != "true" ]; then
            echo "--- container logs ---" >&2; logs "$who" | tail -40 >&2
            fail "$who exited during boot $want; logs above"
        fi
        sleep 2
    done
}

# The security options the generated dev container configuration passes, minus the volumes and the conditional
# devices: this asserts what the image does on boot, and a host device it may or
# may not have is a different test. PASSWORD is empty for the same reason the
# launcher leaves it empty — and that is what makes code-server unauthenticated,
# which is why its port is not published by default.
# `apparmor=unconfined` is the harness's, not the product's — and that gap is a
# finding rather than a convenience. On a host enforcing AppArmor, docker applies
# its default profile, which denies `mount`, and bwrap then fails with "Failed to
# make / slave: Permission denied" before ai-jail reaches anything it would mount.
# GitHub's runners enforce it; the operator's host does not. The generated dev
# container configuration does not pass this option, so on such a host the
# agent's sandbox may not open at all — recorded in
# docs/DEBTS/the-sandbox-under-apparmor/ rather than decided here.
docker run -d --name "$NAME" \
    --cap-add=SYS_ADMIN \
    --security-opt seccomp=unconfined \
    --security-opt systempaths=unconfined \
    --security-opt apparmor=unconfined \
    -e PUID=1000 -e PGID=1000 -e PASSWORD= \
    "$IMAGE" >/dev/null \
    || fail "the container would not start at all from $IMAGE. If devcontainer.metadata has grown \
a containerUser, this is how that looks: s6-overlay needs to start as root"

wait_for_boot 1

# --- the shell survived the boot --------------------------------------------

shell="$(docker exec "$NAME" sh -c "getent passwd '$USER_NAME' | cut -d: -f7" 2>/dev/null || true)"
[ -n "$shell" ] || fail "user $USER_NAME does not exist after init"

case "$shell" in
    */false|*/nologin)
        fail "$USER_NAME's shell is $shell after init. The build set a usable one, so something at \
runtime replaced it — LinuxServer's init is the first place to look, and this is the failure \
core/image.test.sh cannot see" ;;
esac

docker exec -u "$USER_NAME" "$NAME" "$shell" -lc 'exit 0' \
    || fail "$USER_NAME's shell ($shell) exists but will not run a login shell"

# --- the ownership repair, which only a real boot can show ------------------
#
# A fresh container has nothing to repair, so the damage has to be made: this is
# the state a connection left behind before the image declared its user, and
# /config is a named volume, so it is state no rebuild undoes.
#
# The baseline is read rather than assumed: a real image may legitimately have
# had something to repair on its first boot, and what this asserts is the
# *change*, not an absolute count.
baseline="$(hook_count "$(logs)")"

damaged=/config/.vscode-server
docker exec -u 0 "$NAME" sh -c "mkdir -p '$damaged/extensions' && chown -R root:root '$damaged'" \
    || fail "could not create the damaged directory the repair is supposed to fix"

owner_of() { docker exec "$NAME" stat -c '%U' "$1" 2>/dev/null || true; }

[ "$(owner_of "$damaged")" = "root" ] \
    || fail "the fixture did not take: $damaged is owned by $(owner_of "$damaged"), not root"

docker restart "$NAME" >/dev/null || fail "the container would not restart"
wait_for_boot 2

[ "$(owner_of "$damaged")" = "$USER_NAME" ] \
    || fail "after a restart, $damaged is still owned by $(owner_of "$damaged") rather than \
$USER_NAME. If the hook's own test passes, the likely cause is that it was never copied into \
/custom-cont-init.d"

after_repair="$(hook_count "$(logs)")"
[ "$after_repair" -gt "$baseline" ] \
    || fail "the repair happened without saying so. A change to the persistent volume that leaves \
no record is the one nobody can account for later"

hook_repaired "$(logs)" "$damaged" \
    || fail "the hook reported a repair but did not name $damaged, so the record does not say what \
was changed"

# --- and it does not do it again -------------------------------------------
#
# Counted, not matched against an empty log: the base image prints
# "[custom-init] 10-state-ownership.sh: executing..." on every single boot, so
# the hook's silence can only be observed as the count standing still.

docker restart "$NAME" >/dev/null || fail "the container would not restart a second time"
wait_for_boot 3

after_quiet="$(hook_count "$(logs)")"
[ "$after_quiet" -eq "$after_repair" ] \
    || fail "the hook acted again on a boot where there was nothing to repair ($after_repair then \
$after_quiet). Standing still is how the record means something, and it is also the only \
observable proof that no recursive chown ran over thousands of extension files"

# --- the agent state directories exist under a /config that shadows the image -
#
# **A second container, because the mount shape is the whole point.** The boot
# above runs with no mount over /config, where the directories section 5 of the
# Dockerfile creates are really there — which is why every test this repository
# had passed while they were absent in practice.
#
# Docker seeds a *volume* from the image only when the volume is empty at its
# first mount, and seeds a *tmpfs* never. So in production two populations see
# nothing from that layer: a project whose volume predates the line, and any
# container whose /config is a tmpfs. `--tmpfs /config` reproduces the harsher
# of the two exactly, and in one flag.
#
# What makes this worth a second boot rather than a cheaper assertion: ai-jail
# maps into the sandbox only paths that already exist, so a missing directory is
# not created inside the jail — it is simply absent, and the agent starts at
# onboarding on every run with nothing saying why. See
# docs/DEBTS/agent-state-directory-is-lost-under-the-mount/.
docker run -d --name "$SHADOW" \
    --cap-add=SYS_ADMIN \
    --security-opt seccomp=unconfined \
    --security-opt systempaths=unconfined \
    --tmpfs /config \
    -e PUID=1000 -e PGID=1000 -e PASSWORD= \
    "$IMAGE" >/dev/null \
    || fail "the container would not start with a tmpfs over /config"

wait_for_boot 1 "$SHADOW"

for dir in /config/.claude /config/.codex; do
    docker exec "$SHADOW" test -d "$dir" \
        || fail "$dir does not exist after a boot with /config shadowed. The Dockerfile's mkdir \
cannot be the only mechanism: image content under a mountpoint is not a guarantee. A cont-init \
hook is how 10-state-ownership.sh and 40-ai-memory.sh already solve this"

    owner="$(docker exec "$SHADOW" stat -c '%U' "$dir" 2>/dev/null || true)"
    [ "$owner" = "$USER_NAME" ] \
        || fail "$dir exists but belongs to $owner rather than $USER_NAME, so the user the \
container runs as cannot write the credential that goes in it"
done

# --- a project that asked for a tracker gets one, and owns it ---------------
#
# **The scenario this was written around is ownership, not existence.** The hook
# runs before s6-overlay drops privileges and `bd init` writes into
# /config/workspace, which is bind-mounted from the person's own machine. A
# root-owned .beads/ would be a directory the user cannot write, in their own
# repository, created by a container start — the defect 10-state-ownership.sh
# exists to repair, arriving the same way it arrived the first time.
#
# The manifest is written and the container restarted, rather than the image
# being rebuilt: this asserts what a *boot* does, and the state it reacts to is
# state a person's repository would already have.
# **Owned by abc, because that is the shape production has.** The workspace is
# bind-mounted from the person's own machine, where it belongs to them — uid
# 1000, which is abc in here. Created as root instead, the hook drops privileges
# correctly and then cannot write, which is a failure of the fixture rather than
# of the thing being tested. The first version of this did exactly that, and the
# hook exited 1.
docker exec -u 0 "$NAME" sh -c \
    'mkdir -p /config/workspace \
     && printf "{\"beads\":true}" > /config/workspace/.agent-container.stack.json \
     && chown -R abc:abc /config/workspace' \
    || fail "could not write the manifest the tracker hook reads"

docker restart "$NAME" >/dev/null || fail "the container would not restart for the tracker check"
wait_for_boot 4

# **The log, before the verdict.** The base image prints each hook's exit code,
# and that is the difference between "the directory is missing" and "the hook
# died on a command this image does not have" — which is what happened the first
# time this assertion ran, against a stand-in with no `s6-setuidgid`. A failure
# that does not name its own cause sends the next person to guess at the same
# three things.
if ! docker exec "$NAME" test -d /config/workspace/.beads; then
    # **The whole tail, not just the hook announcements.** The first version of
    # this grepped for `[custom-init]` and threw away everything else — which is
    # exactly where the hook's own stderr goes, and therefore the only line that
    # says *why* it exited non-zero. A dump that discards the error message is
    # the same defect as no dump at all, arriving in the code written to prevent
    # it.
    echo "--- the tail of the boot log ---" >&2
    logs | tail -40 >&2
    fail "a project whose manifest asks for a tracker has none after a boot. The hook is \
core/cont-init/45-beads.sh. Its exit code is in the lines above: 127 means the image lacks something \
it calls — \`jq\`, \`bd\` or \`s6-setuidgid\` — and a non-zero from the script itself means it read \
the manifest as a no. If the hook is not listed at all, it was never copied into /custom-cont-init.d"
fi

tracker_owner="$(docker exec "$NAME" stat -c '%U' /config/workspace/.beads 2>/dev/null || true)"
[ "$tracker_owner" = "$USER_NAME" ] \
    || fail "the tracker belongs to $tracker_owner rather than $USER_NAME. It was created before \
s6-overlay dropped privileges, which leaves a directory the person cannot write inside their own \
repository — and no rebuild undoes it, because /config/workspace is a bind"

# **And a second boot does not undo it.** `bd init` exits 1 against a workspace
# that already has one, so a hook without --init-if-missing dies here under
# `set -e` — on every start after the first, for every project that opted in.
# The first version of this hook had exactly that defect and a comment denying
# it.
docker restart "$NAME" >/dev/null || fail "the container would not restart for the second tracker boot"
wait_for_boot 5

docker exec "$NAME" test -d /config/workspace/.beads \
    || fail "the tracker is gone after a second boot, which means the hook ran and failed rather \
than skipping. core/cont-init/45-beads.sh must pass --init-if-missing: a plain \`bd init\` exits 1 \
against a workspace that already has one"

# --- the agent's sandbox actually opens -------------------------------------
#
# **The image can build, boot and pass every check above while `claude` cannot
# start.** On 2026-10-06 the ai-jail pin moved from v1.20.1 to v2.6.4 with every
# flag the wrappers pass verified to still exist — and the jail died before the
# CLI opened. v2.5.0 had turned on dev-toolchain cache persistence by default; it
# reads CARGO_HOME (/usr/local/cargo) and binds $CARGO_HOME/registry and /git
# read-write, neither of which existed, and /usr is read-only inside the jail,
# so bwrap could not create the mount point. Found by the operator, reproduced
# outside the editor.
#
# Checking that flags exist is not checking that the thing runs. This runs it:
# the real wrapper, as the user the editor connects as, through the real jail.
#
# The stand-in has neither ai-jail nor claude, so the check is skipped there —
# and REQUIRE_JAIL makes that skip a failure for the real image, so the one
# place this matters can never pass by not trying.
if docker exec "$NAME" sh -c 'command -v ai-jail >/dev/null && command -v claude >/dev/null'; then
    jail_out="$(docker exec -u "$USER_NAME" -e HOME=/config "$NAME" claude --version 2>&1)" \
        || { echo "--- what the jail said ---" >&2; printf '%s\n' "$jail_out" | tail -20 >&2
             fail "claude does not start through its sandbox. The output above is ai-jail's or \
bwrap's own; a mount-point error under /usr means a toolchain path the image never created"; }
    echo "booted.test: claude starts through the jail: $(printf '%s' "$jail_out" | tail -1)"
elif [ -n "${REQUIRE_JAIL:-}" ]; then
    fail "REQUIRE_JAIL is set but $IMAGE has no ai-jail or no claude, so the sandbox was not \
exercised at all"
fi

echo "booted.test: after init, $USER_NAME has a usable login shell ($shell) and it runs; a \
root-owned $damaged is repaired on the next boot and reported by name; the boot after that \
changes nothing; with /config shadowed by a tmpfs both agent state directories still exist and \
belong to $USER_NAME; and a project whose manifest asks for a tracker gets one owned by \
$USER_NAME."
