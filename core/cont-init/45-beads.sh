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

# **`--init-if-missing`, because a second `bd init` fails.** The first version of
# this hook carried a comment claiming a re-run was a no-op. It is not: run
# twice in a scratch directory, `bd init` exits 1 and aborts with advice about a
# corrupt database. The hook runs on every boot, so without this flag an
# opted-in project's second start would die under `set -e` — and the comment
# asserting otherwise is the defect this repository keeps meeting, in new code
# of its own this time.
#
# Measured by downloading the binary and running it, after three claims about
# this tool's behaviour had already been wrong.
#
# **`bd init` writes more than a database**, and that is why this runs once
# rather than every boot. It appends a marked block to the project's CLAUDE.md
# and AGENTS.md and creates .cursor/, .codex/ and .agents/ — additive, never
# overwriting, verified against files with content in them. Writing those on
# every start would make booting a container dirty somebody's working tree.
#
# Stealth is not passed: the export is what travels (FR-116), and `bd init`'s
# own .gitignore is narrow — it ignores Dolt's data and stages .beads/config.yaml
# and the hooks, which are meant to be committed.
#
# `-C` rather than `cd`, for the reason git has it: the directory a command acts
# on is an argument, not a state the shell was left in.
# **No flags, and that is deliberate.** `bd init`'s options are not listed in
# the project's CLI reference, and a flag this repository guessed at would fail
# the boot of every project that opted in — with the failure appearing as a
# container that starts badly rather than as a wrong tracker. Anything beyond
# the bare command is added after somebody has run it.
s6-setuidgid abc env HOME=/config bd -C "$WORKSPACE" init --init-if-missing --non-interactive
