#!/usr/bin/env bash
# Shadows the OpenCode CLI so that `opencode` is the sandboxed one, for the same
# reason and by the same mechanism as core/bin/claude.sh and core/bin/codex.sh
# (story opencode-is-installed-and-runs-sandboxed-keeping-its-login). Installed
# at /usr/local/bin/opencode, ahead of the /usr/bin/opencode that `npm install
# -g opencode-ai` writes; that absolute path stays reachable as the deliberate
# escape hatch for a human who wants the CLI unjailed.
#
# Adding it widened nothing. ai-jail 2.6.4 carries `opencode` as a known preset,
# and --agent-state already maps ~/.config/opencode and ~/.local/share/opencode,
# which core/cont-init/45-agent-state-dirs.sh creates at boot so there is
# something there to map.
set -euo pipefail

# The recursion guard, as in codex.sh: /usr is bound into the sandbox read-only,
# so this wrapper is still the first `opencode` on PATH in there and ai-jail's
# preset resolves straight back to it. Without the marker that is an unbounded
# loop. Handed in with --env, because --clearenv drops anything not allowlisted.
if [[ -n "${OPENCODE_JAILED:-}" ]]; then
  exec /usr/bin/opencode "$@"
fi

# See claude.sh for why this is sourced rather than checked for.
JAIL_COMMON="${JAIL_COMMON:-/usr/local/lib/jail-common.sh}"
# shellcheck source=jail-common.sh
source "$JAIL_COMMON"

# **OpenCode authenticates from its own file, never from a variable.** A key in
# the environment is not passed into the sandbox, where ai-jail re-expands it
# onto bwrap's command line and anything in the container can read it with ps
# (the rule "hand it over as a file, never as a variable"). `opencode auth login`
# writes ~/.local/share/opencode/auth.json, which persists on the volume and the
# sandbox maps. Said once per key that is set, because a key dropped without a
# word looks like a broken login. The value itself is never printed.
for key in ANTHROPIC_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY GEMINI_API_KEY; do
  if [[ -n "${!key:-}" ]]; then
    echo "opencode: $key is set but is not passed into the sandbox, where a variable can leak." >&2
    echo "opencode: store the key in OpenCode's own file instead: opencode auth login" >&2
  fi
done

# No --standalone: ai-jail warns that opencode 2.x hangs at "Starting background
# server" inside the jail without it (its issue #137), and the npm package this
# image installs was 1.19.5 when this was written. Whether it starts is the
# story's second scenario, checked live; if it hangs, the flag goes here.
jail_args=(
  "${JAIL_COMMON_ARGS[@]}"
  --env OPENCODE_JAILED=1
)

exec ai-jail "${jail_args[@]}" opencode "$@"
