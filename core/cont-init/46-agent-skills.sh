#!/usr/bin/env bash
# custom-cont-init.d script: exposes the image's skills to Codex and OpenCode.
#
# Claude loads the plugin directly with --plugin-dir. Codex and OpenCode both
# discover ~/.agents/skills, so this is the one shared user root. Links point
# into /opt/jvsl, the image's read-only source; no project is modified and no
# second copy can drift from the plugin.
set -euo pipefail

ROOT="${AGENT_STATE_ROOT:-/config}"
SOURCE="${AGENT_CONTAINER_SKILLS_SOURCE:-/opt/jvsl/plugins/agent-container/skills}"
SOURCE="${SOURCE%/}"
TARGET="$ROOT/.agents/skills"

say() { echo "[46-agent-skills] $*"; }

if [ -L "$ROOT/.agents" ] || [ -L "$TARGET" ]; then
    say "refused: $ROOT/.agents or $TARGET is a symlink; leaving it and its target untouched. Remove the symlink to let the image expose its skills."
    exit 0
fi

mkdir -p "$TARGET"
shopt -s nullglob

# Remove only direct symlinks into the plugin source that no longer represent
# the same skill folder or whose SKILL.md has been retired. User-authored files,
# directories and links to anywhere else are never touched.
for entry in "$TARGET"/*; do
    [ -L "$entry" ] || continue
    link="$(readlink "$entry")"
    case "$link" in
        "$SOURCE"/*)
            relative="${link#"$SOURCE"/}"
            if [[ "$relative" != */* ]]; then
                linked_name="${relative##*/}"
                entry_name="${entry##*/}"
                if [ "$entry_name" = "$linked_name" ] && [ ! -f "$link/SKILL.md" ]; then
                    rm -- "$entry"
                fi
            fi
            ;;
    esac
done

if [ ! -d "$SOURCE" ]; then
    say "refused: the agent-container skills are not in the image at $SOURCE; Codex and OpenCode will not have the ceremonies. Rebuild the image to restore them."
    exit 0
fi

for skill in "$SOURCE"/*; do
    [ -d "$skill" ] && [ -f "$skill/SKILL.md" ] || continue
    name="${skill##*/}"
    entry="$TARGET/$name"
    if [ -L "$entry" ]; then
        current="$(readlink "$entry")"
        [ "$current" = "$skill" ] && continue
        say "conflict: preserving existing skill entry $entry; expected image source $skill. Rename the existing skill or the image skill to load both."
        continue
    fi
    if [ -e "$entry" ]; then
        say "conflict: preserving existing skill entry $entry; expected image source $skill. Rename the existing skill or the image skill to load both."
        continue
    fi
    ln -s -- "$skill" "$entry"
done

# The healthy case is silent; the two cases that leave the CLIs without a skill
# name the path and the action needed to restore or resolve it.
