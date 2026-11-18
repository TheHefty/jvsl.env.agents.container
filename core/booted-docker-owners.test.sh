#!/usr/bin/env bash
# An image's own file owners survive a restart of the nested Docker daemon.
#
# Debt the-boots-recursive-chown-of-the-docker-store-loses-the-owners-images-set
# (gh-313). The boot ran `chown -R abc:abc` over the daemon's data-root, which
# is on the persistent volume. Under rootless Docker an image file owned by uid
# 1000 is stored on disk as a subuid; the recursive chown rewrote every layer
# file to abc, which is uid 0 inside the user namespace. So every image already
# in the store read 0:0 after the next boot, and an image that drops root could
# not write to a directory it had prepared for itself. Anything pulled after
# the boot was right until the next one, which is why it looked intermittent.
#
# This drives the symptom where it was found: a booted image, its daemon, an
# image in the store, a restart, and the owner the image's user sees. The image
# is imported from a tar built in the container, so nothing is pulled and no
# registry limit can turn this red.
#
# The unit test beside the service (core/services/svc-dockerd-rootless/
# run.test.sh) holds the line that caused it; this holds the behaviour.
set -euo pipefail

IMAGE="${1:-${CORE_TEST_IMAGE:-core-ci}}"
USER_NAME="${CORE_TEST_USER:-abc}"
BOOT_TIMEOUT="${CORE_TEST_BOOT_TIMEOUT:-180}"
DAEMON_TIMEOUT="${CORE_TEST_DAEMON_TIMEOUT:-120}"
NAME="core-docker-owners-test-$$"
PROBE="owners-probe:gh-313"
WANT="1000/0"

# shellcheck source=/dev/null
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/booted.matchers.sh"

fail() { echo "booted-docker-owners.test: FAIL: $*" >&2; exit 1; }
logs() { docker logs "$NAME" 2>&1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker image inspect "$IMAGE" >/dev/null 2>&1 \
    || fail "no such image: $IMAGE (pass it as the first argument, or set CORE_TEST_IMAGE). Nothing was pulled"

# The nested daemon stacks its storage on fuse-overlayfs or overlay2, and both
# need what the dev container configuration passes when the host has it.
[ -e /dev/fuse ] \
    || fail "this host has no /dev/fuse, so the nested daemon cannot start and nothing here can be measured"

wait_for_boot() {
    local want="$1" deadline
    deadline=$(( $(date +%s) + BOOT_TIMEOUT ))
    while [ "$(init_count "$(logs)")" -lt "$want" ]; do
        if [ "$(date +%s)" -ge "$deadline" ]; then
            echo "--- container logs ---" >&2; logs | tail -40 >&2
            fail "boot $want did not finish within ${BOOT_TIMEOUT}s; logs above"
        fi
        if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" != "true" ]; then
            echo "--- container logs ---" >&2; logs | tail -40 >&2
            fail "the container exited during boot $want; logs above"
        fi
        sleep 2
    done
}

as_user() { docker exec -u "$USER_NAME" -e HOME=/config "$NAME" "$@"; }

# A daemon that does not come back is its own failure, and the one a chown
# that is too narrow would cause: say it, with the service's own lines.
wait_for_daemon() {
    local when="$1" deadline
    deadline=$(( $(date +%s) + DAEMON_TIMEOUT ))
    until as_user docker info >/dev/null 2>&1; do
        if [ "$(date +%s)" -ge "$deadline" ]; then
            echo "--- what the boot said about the nested daemon ---" >&2
            logs | grep -iE 'docker|rootless|storage driver|fuse' | tail -30 >&2
            fail "the nested daemon did not answer within ${DAEMON_TIMEOUT}s $when; the boot's lines about it are above"
        fi
        sleep 2
    done
}

# The owner of app/ as the image's user sees it: a container's filesystem,
# exported through the daemon. `create` runs nothing, so the image needs no
# binary in it.
# shellcheck disable=SC2016 # expanded by the inner bash, on purpose
owner_seen() {
    as_user bash -c '
        set -euo pipefail
        c="$(docker create "$1" /none)"
        trap "docker rm -f \"\$c\" >/dev/null" EXIT
        docker export "$c" | tar --numeric-owner -tvf - app/ | awk "NR==1 { print \$2 }"
    ' _ "$PROBE"
}

docker run -d --name "$NAME" \
    --device /dev/fuse \
    --cap-add=SYS_ADMIN \
    --security-opt seccomp=unconfined \
    --security-opt systempaths=unconfined \
    --security-opt apparmor=unconfined \
    -e PUID=1000 -e PGID=1000 -e PASSWORD= \
    "$IMAGE" >/dev/null \
    || fail "the container would not start from $IMAGE"

wait_for_boot 1
wait_for_daemon "after the first boot"
echo "booted-docker-owners.test: daemon up; $(as_user docker info --format 'storage driver {{.Driver}}' 2>/dev/null)"

# app/ owned by 1000:0, the shape of gh-313's reproducer (chown 1000:0, USER 1000).
# shellcheck disable=SC2016 # expanded by the inner bash, on purpose
as_user bash -c '
    set -euo pipefail
    d="$(mktemp -d)"; mkdir "$d/app"
    tar --numeric-owner --owner=1000 --group=0 -C "$d" -cf - app | docker import - "$1" >/dev/null
    rm -rf "$d"
' _ "$PROBE" || fail "could not import the probe image into the nested daemon"

before="$(owner_seen)" || fail "could not read the probe image's owners back from the daemon"
[ "$before" = "$WANT" ] \
    || fail "the daemon stored app/ as $before right after importing it as $WANT, before any restart. \
That is not the boot's chown; it is the storage driver itself, and a different finding"

docker restart "$NAME" >/dev/null || fail "the container would not restart"
wait_for_boot 2
wait_for_daemon "after a restart"

after="$(owner_seen)" || fail "could not read the probe image's owners back after the restart"
[ "$after" = "$WANT" ] \
    || fail "an image already in the store lost its owners across a restart: app/ was $WANT and is now $after. \
The boot rewrote the daemon's store (gh-313): look for a recursive chown of the data-root in \
core/services/svc-dockerd-rootless/run"

echo "booted-docker-owners.test: an image in the store keeps its owners ($WANT) across a restart of the nested daemon"
