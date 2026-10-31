#!/usr/bin/env bash
# custom-cont-init.d script: runs as root, before s6-overlay drops privileges
# to 'abc'. Makes sure each agent's state directory exists under /config and
# belongs to 'abc', whatever is mounted over /config.
#
# **Section 5 of core/Dockerfile.frag does this too, and that is not enough.**
# Image content under a mountpoint is not a guarantee: Docker seeds a named
# volume from the image only when the volume is empty at its *first* mount, and
# seeds a tmpfs never. So the build-time mkdir is invisible to two populations
# that both exist in production — a project whose volume predates that line,
# and any container whose /config is a tmpfs. The Dockerfile line is kept
# because it is correct for a volume created empty and costs nothing otherwise;
# it just cannot be the only mechanism.
#
# This is the same reason 10-state-ownership.sh and 40-ai-memory.sh run at boot
# rather than at build, stated in their own words, and section 5 was the one
# place that did not follow.
#
# **What it costs when the directory is absent**, which is why this is not
# cosmetic: ai-jail maps into the sandbox only the paths that already exist, so
# a missing directory is not created inside the jail — it is simply absent, and
# the agent starts at onboarding on every single run with nothing saying why.
#
# See the debt `agent-state-directory-is-lost-under-the-mount` in the tracker.
set -euo pipefail

# Overridable so the unit test beside this file can run without /config.
ROOT="${AGENT_STATE_ROOT:-/config}"

# Not a loop over everything an agent might keep: each entry is a directory some
# agent's own tooling expects to find and will not create for itself inside the
# sandbox. Adding one is a decision, so they are written out.
# ~/.agents is Codex's current user skill root and OpenCode's compatibility
# skill root; the image populates only its skills/ child (story
# the-skills-the-image-carries-are-discovered-only-by-the-claude-sessions).
# OpenCode keeps its config under ~/.config/opencode and its login and sessions
# under ~/.local/share/opencode (story
# opencode-is-installed-and-runs-sandboxed-keeping-its-login).
for dir in "$ROOT/.claude" "$ROOT/.codex" "$ROOT/.agents" "$ROOT/.config/opencode" "$ROOT/.local/share/opencode"; do
    if [ "$dir" = "$ROOT/.agents" ] && [ -L "$dir" ]; then
        echo "45-agent-state-dirs: refused: $dir is a symlink; leaving the link and its target untouched."
        continue
    fi
    # **Every directory created on the way is abc's, and only those.** mkdir -p
    # as root would leave ~/.config or ~/.local root-owned, and every other tool
    # that writes there would fail; one that already exists is somebody's, and
    # is left exactly as it is. Walked from the root, one component at a time.
    path="$ROOT"
    rest="${dir#"$ROOT"/}"
    IFS=/ read -ra parts <<<"$rest"
    for part in "${parts[@]}"; do
        path="$path/$part"
        if [ ! -d "$path" ]; then
            mkdir "$path"
            # The agent's own directory is chowned below, on every boot.
            [ "$path" = "$dir" ] || chown abc:abc "$path"
        fi
    done
    # The agent's own directory is writable by the user the container runs as,
    # on every boot, as it always was. Not -R: a recursive chown would walk agent
    # credentials, shell history and whatever else has accumulated, on every
    # boot of every project, the cost 10-state-ownership.sh refuses for the same
    # reason.
    chown abc:abc "$dir"
done
