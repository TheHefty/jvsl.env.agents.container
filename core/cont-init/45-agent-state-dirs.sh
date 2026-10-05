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
# See docs/DEBTS/agent-state-directory-is-lost-under-the-mount/.
set -euo pipefail

# Overridable so the unit test beside this file can run without /config.
ROOT="${AGENT_STATE_ROOT:-/config}"

# Not a loop over everything an agent might keep: each entry is a directory some
# agent's own tooling expects to find and will not create for itself inside the
# sandbox. Adding one is a decision, so they are written out.
for dir in "$ROOT/.claude" "$ROOT/.codex"; do
    # -p so an existing directory is left exactly as it is: this runs on every
    # boot, and a credential already in there must not be disturbed.
    mkdir -p "$dir"
    # Not -R. A recursive chown here would walk agent credentials, shell history
    # and whatever else has accumulated on every boot of every project — the
    # cost 10-state-ownership.sh refuses for the same reason. The directory
    # itself is what has to be writable by the user the container runs as.
    chown abc:abc "$dir"
done
