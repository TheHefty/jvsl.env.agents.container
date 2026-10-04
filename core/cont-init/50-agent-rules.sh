#!/usr/bin/env bash
# custom-cont-init.d script: runs as root, before s6-overlay drops privileges to
# 'abc'. Puts the normative documents where the agent loads them from.
#
# **Why they are written at boot rather than baked at build.** Everything here
# lands under /config, which is a named volume Docker seeds from the image only
# on its *first* mount — so anything written during `docker build` is shadowed
# the moment a real volume mounts over it, and a volume that already exists
# would never see a later image's version at all. The same reason the ai-memory
# hook and the android stack's AVD seeding run here.
#
# **Why `rules/` and not an import.** A project's CLAUDE.md could name these by
# absolute path, and that was rejected on a measurement: an `@path` resolving
# outside the working directory is classified as *external*, and declining its
# approval dialog once disables those imports permanently with nothing said
# afterwards — leaving an agent with no modes, no rules and no gates and no way
# to tell. Files in `~/.claude/rules/` load with no import and no dialog, which
# is the escape the documentation itself names.
#
# **Why only two of the twenty-seven.** Everything in rules/ is resident in
# every session. MODES.md and RULES.md are 26.6 KB of what governs every turn;
# INITIALIZATION.md is another 13.7 KB describing a moment that happens once,
# and a consuming monorepo already refused to import it for this reason. The
# rest stay readable at their path in the image, for when they are the subject.
set -euo pipefail

SOURCE="${AGENT_DOCS_DIR:-/opt/jvsl/docs/agent/en}"
TARGET="${AGENT_RULES_DIR:-/config/.claude/rules}"
MOUNTS="${AGENT_RULES_MOUNTS:-/proc/mounts}"
RESIDENT=(MODES.md RULES.md)

say() { echo "[50-agent-rules] $*"; }

if [ ! -d "$SOURCE" ]; then
    say "refused: the normative documents are not in the image at $SOURCE. Nothing was written."
    say "This means the image is incomplete rather than this project being unconfigured — the"
    say "documents are COPYed in by core/Dockerfile.frag, so a rebuild is what fixes it."
    exit 0
fi

# **The refusal this hook exists for.** /config/.claude is a bind from the
# person's own ~/.claude: writing there would put one project's rules into every
# project on their machine, and the first symptom is a rule they never set being
# in force somewhere unrelated. The generated configuration mounts a tmpfs over
# `rules/` alone — but a declaration in a file this hook never reads is not a
# guarantee this hook holds, so it checks.
if ! awk -v t="$TARGET" '$2 == t { found = 1 } END { exit !found }' "$MOUNTS" 2>/dev/null; then
    say "refused: $TARGET is not a mount of its own. Nothing was written."
    say "Without that mount it is a path inside the bind from this machine's own ~/.claude, and"
    say "writing there would put this project's rules into every project on it. The generated"
    say "dev container configuration is what declares the mount; regenerate it by reopening."
    exit 0
fi

# Emptied rather than added to: a document retired upstream would otherwise sit
# here until somebody wondered why a rule they deleted was still in force. The
# mount is a tmpfs, so this is belt and braces on a directory that starts empty
# anyway — and it is what makes the hook correct if the mount ever changes.
find "$TARGET" -mindepth 1 -maxdepth 1 -delete 2>/dev/null || true

for doc in "${RESIDENT[@]}"; do
    if [ ! -f "$SOURCE/$doc" ]; then
        say "refused: $SOURCE exists but does not contain $doc. Nothing was written."
        find "$TARGET" -mindepth 1 -maxdepth 1 -delete 2>/dev/null || true
        exit 0
    fi
    install -m 0644 "$SOURCE/$doc" "$TARGET/$doc"
done

# The agent runs as abc and reads these; root wrote them.
chown -R abc:abc "$TARGET" 2>/dev/null || true

# **Silent from here.** A cont-init hook runs on every boot and the healthy case
# is the common one, so saying "wrote two files" every time trains everybody to
# stop reading this log — and then the refusals above go unread too.
