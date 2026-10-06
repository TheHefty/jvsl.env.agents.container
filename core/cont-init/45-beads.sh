#!/usr/bin/env bash
# custom-cont-init.d script: runs as root, before s6-overlay drops privileges
# to 'abc'. Initialises the work tracker for a project that asked for one.
#
# **`bd init` is explicit and nothing in the tool works before it**, which is
# the whole reason this exists rather than a line in a README. A project that
# opted in should find a tracker, not an instruction.
#
# **As 'abc', never as root, and that is the scenario this was written around.**
# This runs before privileges are dropped, and `bd init` writes into
# /config/workspace — which is bind-mounted from the person's own machine. A
# root-owned .beads/ would be a directory the user cannot write, in their own
# repository, created by a container start. That is not hypothetical: it is the
# defect core/cont-init/10-state-ownership.sh exists to repair, and it arrived
# there exactly this way.
#
# **Every failure to read an explicit yes is a no.** No manifest, a manifest
# that does not parse, no field, a field that says anything else — all mean the
# project did not ask. The cost of being wrong in the other direction is a
# database and a .gitignore entry written into somebody's repository by
# something they did not run.
#
# See docs/PLANNING/beads-tracks-the-work/the-image-carries-bd/.
set -euo pipefail

# Overridable so the test beside this file drives the real script.
WORKSPACE="${BEADS_WORKSPACE:-/config/workspace}"
MANIFEST="$WORKSPACE/.agent-container.stack.json"

[ -f "$MANIFEST" ] || exit 0

# `jq -e` exits non-zero for false and for null, which is the reading wanted:
# only an explicit true is a yes. A manifest that does not parse exits non-zero
# too, and that is also a no.
jq -e '.beads == true' "$MANIFEST" >/dev/null 2>&1 || exit 0

# `bd init` without --force leaves an existing database alone, so a re-run on
# every boot is a no-op — the same property 40-ai-memory.sh relies on.
#
# Stealth is not passed: the tracker's export is what travels (FR-116), and
# `bd init` writing its own .gitignore entries for .beads/ is the behaviour
# this template follows rather than fights.
# **No flags, and that is deliberate.** `bd init`'s options are not listed in
# the project's CLI reference, and a flag this repository guessed at would fail
# the boot of every project that opted in — with the failure appearing as a
# container that starts badly rather than as a wrong tracker. Anything beyond
# the bare command is added after somebody has run it.
cd "$WORKSPACE" && s6-setuidgid abc env HOME=/config bd init
