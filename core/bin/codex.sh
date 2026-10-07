#!/usr/bin/env bash
# Shadows the OpenAI Codex CLI so that `codex` is the sandboxed one, for the
# same reason and by the same mechanism as core/bin/claude.sh. Installed at
# /usr/local/bin/codex, ahead of the /usr/bin/codex that `npm install -g`
# writes; that absolute path stays reachable as the deliberate escape hatch for
# a human who wants the CLI unjailed.
#
# Adding it widened nothing. ai-jail has carried `codex` as a known preset since
# before this image shipped it, and --agent-state already maps ~/.codex beside
# ~/.claude — so the sandbox this runs under is the one Claude already ran
# under, which is the point of core/bin/jail-common.sh holding the list.
set -euo pipefail

# The recursion guard, and the same trap as in claude.sh: /usr is bound into the
# sandbox read-only, so /usr/local/bin/codex is still the first `codex` on PATH
# in there and ai-jail's preset resolves straight back to this wrapper. Without
# the marker that is not a bad sandbox, it is an unbounded loop. It has to be
# handed in with --env rather than exported, because --clearenv drops anything
# that is not on the allowlist before the preset runs.
if [[ -n "${CODEX_JAILED:-}" ]]; then
  exec /usr/bin/codex "$@"
fi

# See claude.sh for why this is sourced rather than checked for.
JAIL_COMMON="${JAIL_COMMON:-/usr/local/lib/jail-common.sh}"
# shellcheck source=jail-common.sh
source "$JAIL_COMMON"

# **Codex authenticates from its own file, never from a variable.** Until
# 2026-10-07 this forwarded OPENAI_API_KEY with --env, the one secret still
# crossing into the sandbox by variable (the debt
# forwarded-secrets-land-in-the-sandbox-argv in the tracker). Decided by the
# operator: it is not forwarded at all. An API key is stored where a login is,
# with `printenv OPENAI_API_KEY | codex login --with-api-key`, measured to read
# stdin into ~/.codex/auth.json.
#
# `codex login` writes ~/.codex/auth.json, and that persists: --agent-state
# maps ~/.codex, and core/cont-init/45-agent-state-dirs.sh creates
# /config/.codex **at boot** so there is a directory there to map.
#
# This comment used to credit section 5 of core/Dockerfile.frag for that
# directory, and it was wrong in a way that mattered: section 5 writes it at
# build time, under /config, where a named volume that already exists is never
# seeded from the image and a tmpfs is never seeded at all. The directory was
# genuinely absent in running containers while this comment said it was there.
# ai-jail maps only paths that already exist, so Codex was starting at
# onboarding on every run. See
# the debt `agent-state-directory-is-lost-under-the-mount` in the tracker.
#
# Neither path is required and neither is configured for you — handing an agent
# a credential is a decision, so scope it narrowly and give it an expiry.
#
# There is no CODEX_HOME here on purpose. Everything Codex keeps — config.toml,
# auth.json, history, sessions — is under ~/.codex, which is /config/.codex in
# this image and on the persistent volume already. What CLAUDE_CONFIG_DIR exists
# to fix was a *second* file one level up that nothing mounted; Codex has no
# equivalent, so setting the variable would only be a second definition of the
# default.
# Said once, because a key somebody set and the wrapper dropped looks like a
# broken login. The value itself is never printed.
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  echo "codex: OPENAI_API_KEY is set but is not passed into the sandbox, where a variable can leak." >&2
  echo "codex: store it in Codex's own file instead: printenv OPENAI_API_KEY | codex login --with-api-key" >&2
fi

jail_args=(
  "${JAIL_COMMON_ARGS[@]}"
  --env CODEX_JAILED=1
)

exec ai-jail "${jail_args[@]}" codex "$@"
