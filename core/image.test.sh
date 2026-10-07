#!/usr/bin/env bash
# What `core` is, rather than that `core` built. `stack-build` already runs an
# optional `stacks/<stack>/image.test.sh` for the same reason — a successful
# `docker build` proves apt-get ran and nothing else — and until now `core` had
# no equivalent.
#
# **This runs on the host, not inside the image**, which is where it differs
# from the per-stack tests. Half of what it checks is a label, and a container
# cannot read its own image's labels: `docker inspect` is the only way, and it
# is the runner that can call it. The shell half is a `docker run` from here
# rather than a script copied in, so both halves live in one file.
#
# **It is blind to anything runtime does.** `--entrypoint` bypasses s6-overlay,
# so nothing a `cont-init` script writes and nothing LinuxServer's init rewrites
# is visible here. That is the whole reason a second, booted test exists beside
# it; this one answers "did the build do it", and that one answers "did the
# runtime keep it". Keeping them apart is what makes a red CI name which half
# broke.
set -euo pipefail

IMAGE="${1:-${CORE_TEST_IMAGE:-core-ci}}"
USER_NAME="${CORE_TEST_USER:-abc}"

fail() { echo "image.test: FAIL: $*" >&2; exit 1; }

docker image inspect "$IMAGE" >/dev/null 2>&1 \
    || fail "no such image: $IMAGE (pass it as the first argument, or set CORE_TEST_IMAGE)"

# --- the label, from outside ---------------------------------------------

metadata="$(docker image inspect "$IMAGE" \
            --format '{{index .Config.Labels "devcontainer.metadata"}}' 2>/dev/null || true)"

[ -n "$metadata" ] || fail "the image declares no devcontainer.metadata label, so a dev container \
client has nothing to read and connects as the image's USER, which is root"

echo "$metadata" | jq -e 'type == "array"' >/dev/null 2>&1 \
    || fail "devcontainer.metadata is not a JSON array: $metadata"

echo "$metadata" | jq -e --arg u "$USER_NAME" '[.[] | select(.remoteUser == $u)] | length == 1' \
    >/dev/null 2>&1 \
    || fail "devcontainer.metadata does not declare remoteUser \"$USER_NAME\": $metadata"

# **The half that remoteUser leaves behind.** Connecting as abc does not give
# abc a HOME: `bash` does not set it, `login` and `su` do, and neither the
# editor's server nor `docker exec` runs either — so it stays whatever the
# container was started with, which is root's. Tools keeping state under $HOME
# then fail on a path abc cannot read and call it a permissions problem.
# Checked statically too, by core/check-devcontainer-metadata.sh; here is where
# it is read back off a built image.
echo "$metadata" | jq -e '[.[] | select(.remoteEnv.HOME == "/config")] | length >= 1' \
    >/dev/null 2>&1 \
    || fail "devcontainer.metadata declares no remoteEnv HOME of /config: $metadata"

if echo "$metadata" | jq -e 'any(.[]; has("containerUser"))' >/dev/null 2>&1; then
    fail "devcontainer.metadata declares containerUser. This image must start as root so \
s6-overlay can drop privileges itself; declaring it stops the container booting"
fi

# --- the shell, from inside ----------------------------------------------
#
# --network none because an image test asserts what is IN the image; anything
# it had to fetch would be testing something else. Same reasoning as the
# per-stack tests.
shell="$(docker run --rm --network none --entrypoint /bin/sh "$IMAGE" \
         -c "getent passwd '$USER_NAME' | cut -d: -f7" 2>/dev/null || true)"

[ -n "$shell" ] || fail "user $USER_NAME does not exist in the image"

case "$shell" in
    */false|*/nologin)
        fail "$USER_NAME's shell is $shell, which cannot be logged in as — a client that opens a \
terminal as this user gets nothing, and the session looks broken rather than refused" ;;
esac

docker run --rm --network none --entrypoint /bin/sh "$IMAGE" -c "test -x '$shell'" \
    || fail "$USER_NAME's shell is $shell, which is not executable in this image"

# --- what the launcher left behind, and what it did not -------------------
#
# The release that deleted the launcher removed four `-dev` libraries that
# existed only so its crate could be built from inside the container. Two
# claims are worth holding here rather than in prose.

absent="$(docker run --rm --entrypoint /bin/bash "$IMAGE" \
    -c "dpkg-query -W -f='\${Package}\n' libwebkit2gtk-4.1-dev libxdo-dev \
        libayatana-appindicator3-dev librsvg2-dev 2>/dev/null" 2>/dev/null || true)"
[ -z "$absent" ] || fail "the image still installs the launcher's libraries, which nothing needs \
now that the launcher is gone: $(printf '%s' "$absent" | tr '\n' ' ')"

# **rustup is not the launcher's, and it is the thing most likely to be deleted
# by mistake** — it sits in the same section of the fragment and used to be
# justified by it. The `rust` stack selects a toolchain rather than installing
# rustup itself, and the agent's sandbox is handed RUSTUP_HOME because a `cargo`
# on PATH without it is a shim that cannot find the toolchain it shims. So this
# asserts the toolchain answers, not merely that a binary is on PATH.
toolchain="$(docker run --rm --entrypoint /bin/bash "$IMAGE" \
    -c 'rustup toolchain list 2>/dev/null | head -1' 2>/dev/null || true)"
case "$toolchain" in
    *stable*) ;;
    *) fail "rustup does not report a stable toolchain in this image (got: '$toolchain'). It is \
not the launcher's: the rust stack selects a toolchain rather than installing rustup, and the \
sandbox forwards RUSTUP_HOME so the agent's cargo can find one" ;;
esac

# --- what the base provides, and the reason this is asserted at all ----------
#
# Five things arrive from the base image and are installed nowhere in this
# template: s6-overlay, the `abc` user, PUID/PGID, `/config` as that user's
# home, and the `cont-init` mechanism. They came from the code-server image
# because that image is itself built on the same LinuxServer family — so taking
# the editor out was a changed FROM rather than a reimplementation.
#
# **A base swap is exactly when one of them disappears quietly, and each would
# be diagnosed somewhere else.** PUID/PGID unapplied reads as a host
# permissions problem; a missing custom-cont-init.d reads as a hook that does
# not work; a shell that is not there reads as a broken editor connection. So
# each has an assertion, and they cost one `docker run` between them.
base="$(docker run --rm --entrypoint /bin/bash "$IMAGE" -c '
    printf "uid=%s\n" "$(id -u abc 2>/dev/null)"
    printf "home=%s\n" "$(getent passwd abc | cut -d: -f6)"
    printf "s6=%s\n" "$([ -d /etc/s6-overlay/s6-rc.d/user/contents.d ] && echo yes || echo no)"
    printf "hooks=%s\n" "$([ -d /custom-cont-init.d ] && echo yes || echo no)"
    printf "adduser=%s\n" "$([ -d /etc/s6-overlay/s6-rc.d/init-adduser ] && echo yes || echo no)"
    printf "editor=%s\n" "$(command -v code-server >/dev/null 2>&1 && echo present || echo absent)"
' 2>/dev/null || true)"

field() { printf '%s' "$base" | sed -n "s/^$1=//p"; }

[ "$(field uid)" = "911" ] || fail "abc's uid is '$(field uid)', not 911. LinuxServer's base creates \
it at 911 and its init rewrites it at runtime from PUID — /etc/subuid is keyed by name for that \
reason. A different uid here means the base is not the family this template assumes"

[ "$(field home)" = "/config" ] || fail "abc's home is '$(field home)', not /config. The whole \
layout — the per-project volume, CLAUDE_CONFIG_DIR, the bind-mounted workspace — is that path"

[ "$(field s6)" = "yes" ] || fail "no /etc/s6-overlay/s6-rc.d/user/contents.d in this image, so \
the nested Docker daemon and ai-memory are registered nowhere and nothing would say so"

[ "$(field hooks)" = "yes" ] || fail "no /custom-cont-init.d in this image, so every boot hook \
silently never runs — the ownership repair and the git credential helper among them"

[ "$(field adduser)" = "yes" ] || fail "no init-adduser service in this image. That is what applies \
PUID/PGID, and without it the first write into a bind mount lands as uid 911, which reads as a host \
permissions problem rather than as a missing base feature"

[ "$(field editor)" = "absent" ] || fail "code-server is still on PATH in this image, which is the \
one thing the release that changed this base claims to have removed"

# **The documents have to be in the image, because the boot hook copies from it
# rather than from anywhere a project can reach.** A hook that refuses because
# its source is absent says the image is incomplete — which is true, and this is
# what stops that being discovered at somebody's first boot.
docs_present="$(docker run --rm --entrypoint sh "$IMAGE" -c \
    'ls /opt/jvsl/docs/agent/en 2>/dev/null | wc -l' || echo 0)"
[ "$docs_present" -ge 12 ] || fail "the image carries $docs_present file(s) under \
/opt/jvsl/docs/agent/en, expected at least 12. The boot hook that writes the agent's rules copies \
from there and would refuse, saying the image is incomplete — which it would be"

# **Node.js 22, from nodesource's source signed by the vendored key.** The
# fragment writes that source by hand since 2026-10-07, instead of piping
# setup_22.x into bash as root. A source that drifted would install Debian's
# own older nodejs, and the Claude Code CLI needs 22.
node_major="$(docker run --rm --network none --entrypoint /bin/bash "$IMAGE" -c 'node --version 2>/dev/null' | sed -E 's/^v([0-9]+).*/\1/')"
[ "$node_major" = "22" ] || fail "$IMAGE has node major '${node_major:-absent}', expected 22: \
core/Dockerfile.frag writes /etc/apt/sources.list.d/nodesource.sources by hand, and it did not deliver node_22.x"
node_signed="$(docker run --rm --network none --entrypoint /bin/bash "$IMAGE" -c \
    'grep -c "^Signed-By: /usr/share/keyrings/nodesource.asc$" /etc/apt/sources.list.d/nodesource.sources' || true)"
[ "$node_signed" = "1" ] || fail "$IMAGE's nodesource source is not signed by /usr/share/keyrings/nodesource.asc"

# **bd's usage metrics are off.** bd ships them on: the name of every command
# run, the version and the platform, keyed by a machine-derived id. Measured on
# 2026-10-07, after dozens of commands had already reported. The operator
# decided nothing leaves without a decision, so the image sets DO_NOT_TRACK,
# which bd honours. The sandbox has its own copy, in core/bin/jail-common.sh.
metrics="$(docker run --rm --network none --entrypoint /bin/bash "$IMAGE" -c 'bd metrics status 2>&1 | head -1')"
[ "$metrics" = "Anonymous usage metrics: OFF" ] || fail "bd in $IMAGE reports its metrics as: \
\"$metrics\". The image must set DO_NOT_TRACK=1, which bd honours; without it every bd command run in \
a project's container reports itself"

# **Every `bd` command the rules name exists in the bd this image carries.**
# The rules tell an agent which commands to run, and a bump that renames a flag
# would leave it running one that fails mid-session, then improvising another.
# A word after a `<placeholder>` is an argument, not a subcommand:
# `bd label remove <id> proposed` is the command `bd label remove`.
# `--help` alone proves nothing: measured, `bd dolt nonexistent --help` exits 0
# and prints `bd dolt`'s help. So the Usage line has to name exactly the
# command, and each flag has to appear in that help. BD_DOCS lets the same
# script run against a checkout, which is how it was first seen to fail.
BD_COMMANDS_CHECK='
docs="${BD_DOCS:-/opt/jvsl/docs/agent}"
cat "$docs"/en/*.md "$docs"/pt-BR/*.md | grep -oE "\`bd [^\`]*\`" | tr -d "\`" | sort -u |
while read -r cmd; do
    words=""; flags=""; args=""
    for w in $cmd; do
        case "$w" in
            bd) ;;
            --*) flags="$flags $w" ;;
            "<"*) args=1 ;;
            [a-z]*) [ -n "$flags$args" ] || words="$words $w" ;;
        esac
    done
    help="$(bd $words --help 2>&1)" || { echo "\`$cmd\`: bd$words --help exits non-zero"; continue; }
    printf "%s\n" "$help" | grep -A1 "^Usage:" | tail -1 | grep -qE "^ *bd$words( |\$)" \
        || { echo "\`$cmd\`: bd has no command \"bd$words\""; continue; }
    for f in $flags; do
        printf "%s\n" "$help" | grep -qE -- "$f([ ,=]|\$)" || echo "\`$cmd\`: bd$words has no flag $f"
    done
done'
bd_missing="$(docker run --rm --network none --entrypoint /bin/bash "$IMAGE" -c "$BD_COMMANDS_CHECK" 2>&1)" \
    || fail "could not run the bd command check inside $IMAGE: $bd_missing"
[ -z "$bd_missing" ] || fail "the normative documents name bd commands this image's bd does not \
have, so an agent following them fails mid-session:
$bd_missing"

echo "image.test: $IMAGE declares remoteUser $USER_NAME, declares no containerUser, gives \
$USER_NAME a usable login shell ($shell), installs none of the launcher's libraries, and still \
has a rust toolchain ($toolchain), carries $docs_present normative documents, and its bd has every \
command they name."
