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
# See the story `the-image-carries-bd` in the tracker.
set -euo pipefail

# Overridable so the test beside this file drives the real script.
WORKSPACE="${BEADS_WORKSPACE:-/config/workspace}"
MANIFEST="$WORKSPACE/.agent-container.stack.json"

[ -f "$MANIFEST" ] || exit 0

# `jq -e` exits non-zero for false and for null, which is the reading wanted:
# only an explicit true is a yes. A manifest that does not parse exits non-zero
# too, and that is also a no.
jq -e '.beads == true' "$MANIFEST" >/dev/null 2>&1 || exit 0

# **`bd init` never runs in the person's repository.** Measured against bd
# v1.3.1 on 2026-10-06: every `bd init` that creates a database in a git
# repository commits on its own, and the commit is of the index, so it sweeps in
# whatever the person had staged. That happens on a first opt-in and again in a
# fresh clone. No flag turns it off, and hiding git from it (GIT_DIR) makes it
# fail half-way and leave a partial .beads/. Without --skip-agents and
# --skip-hooks it also writes CLAUDE.md, AGENTS.md, .claude/settings.json (a
# SessionStart hook that tells every session to create items and to use
# `bd remember`), Codex and Cursor hooks, and repoints core.hooksPath. FR-121.
#
# So a boot takes exactly one of four paths, and none of them commits:
#
#   no opt-in                         nothing (above)
#   a local database exists           nothing: a second boot changes nothing
#   .beads/ tracked, no database      `bd bootstrap`, which restores from the
#                                     remote and was measured never to commit
#   no .beads/ (the first opt-in)     `bd init` in a throwaway clone, and only
#                                     its .beads/ is brought back
#
# **The tracker travels by the project's git remote** (FR-116, amended on
# 2026-10-06): `bd dolt push` writes refs/dolt/data, and a clone's bootstrap
# finds it. The agent runs that push alongside every `git push` the operator
# approves. Nothing here pushes.
#
# See the task `initialising-leaves-the-repository-alone`, under the story
# `the-image-carries-bd` in the tracker.

say() { echo "[45-beads] $*"; }

# As abc, never as root, and HOME is declared because `bash` does not set it.
as_abc() { s6-setuidgid abc env HOME=/config "$@"; }

if ! as_abc git -C "$WORKSPACE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    say "not initialising the tracker: $WORKSPACE is not a git repository, and the tracker \
travels by the project's git remote. bd would run \`git init\` here, which is not this hook's to do."
    exit 0
fi

# **The local database is what decides, not .beads/.** .beads/ is tracked; the
# database under it is ignored by bd's own .gitignore, so a clone has the first
# and not the second.
if [ -d "$WORKSPACE/.beads/embeddeddolt" ]; then
    exit 0
fi

if [ -d "$WORKSPACE/.beads" ]; then
    # **Bounded, because it reaches the network** and a boot that waits on a
    # remote looks like the editor's fault and names no cause. A failure or a
    # timeout leaves an empty tracker and says so; it never stops the boot.
    bound="${BEADS_BOOTSTRAP_TIMEOUT:-60}"
    if ( cd "$WORKSPACE" && timeout -k 5 "$bound" s6-setuidgid abc env HOME=/config bd bootstrap </dev/null ); then
        as_abc git -C "$WORKSPACE" config beads.role maintainer
        # A checkout gives .beads/ 0755, and bd warns on every command until it
        # is 0700. Git does not track a directory's mode, so this changes
        # nothing anybody would commit.
        as_abc chmod 700 "$WORKSPACE/.beads"
        say "tracker restored with bd bootstrap"
    else
        rc=$?
        say "the tracker is empty: bd bootstrap $( [ "$rc" -eq 124 ] && echo "did not finish within ${bound}s" || echo "exited $rc" ) \
while restoring from the project's remote. Nothing was committed. Run \`bd bootstrap\` in the workspace once the remote is reachable."
    fi
    exit 0
fi

# --- the first opt-in: init in a throwaway clone ----------------------------
#
# **The clone takes the workspace's origin URL**, so .beads/config.yaml carries
# the same sync.remote a later clone derives, and bootstrap there has nothing to
# rewrite. **The prefix is the repository's name**, because bd otherwise names
# ids after the directory it ran in, which here would be the throwaway one. bd
# turns dots into underscores itself.
origin="$(as_abc git -C "$WORKSPACE" remote get-url origin 2>/dev/null || true)"
prefix="$(basename "${origin:-$WORKSPACE}" .git)"
scratch="$(as_abc mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

as_abc git clone -q --shared "$WORKSPACE" "$scratch/c" 2>/dev/null
[ -z "$origin" ] || as_abc git -C "$scratch/c" remote set-url origin "$origin"

# The identity only signs bd's commit inside the throwaway clone, which is
# deleted below; it never reaches the person's history.
( cd "$scratch/c" && as_abc env GIT_AUTHOR_NAME=bd GIT_AUTHOR_EMAIL=bd@localhost \
    GIT_COMMITTER_NAME=bd GIT_COMMITTER_EMAIL=bd@localhost \
    bd init --non-interactive --skip-agents --skip-hooks --prefix "$prefix" >/dev/null )

as_abc cp -a "$scratch/c/.beads" "$WORKSPACE/.beads"

# bd's ignore lines, appended only where missing, never over what is there.
as_abc touch "$WORKSPACE/.gitignore"
added=0
while IFS= read -r line; do
    [ -n "$line" ] || continue
    if ! grep -qxF -- "$line" "$WORKSPACE/.gitignore"; then
        printf '%s\n' "$line" | as_abc tee -a "$WORKSPACE/.gitignore" >/dev/null
        added=$((added + 1))
    fi
done < "$scratch/c/.gitignore"

as_abc git -C "$WORKSPACE" config beads.role maintainer

say "tracker initialised with prefix '$prefix'. .beads/ and $added .gitignore line(s) are new \
and not committed: nothing here commits for you."
