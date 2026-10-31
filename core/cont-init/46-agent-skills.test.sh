#!/usr/bin/env bash
# Drives the real 46-agent-skills.sh against a throwaway plugin and agent home.
# The image's plugin is the only source; ~/.agents/skills is the shared root
# Codex and OpenCode discover without copying the skills into a project.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$HERE/46-agent-skills.sh"

pass=0
fail=0
assert() {
    if [ "$2" = "$3" ]; then echo "ok      $1"; pass=$((pass + 1)); else
        echo "NOT OK  $1" >&2; echo "        expected: $3" >&2; echo "        got:      $2" >&2; fail=$((fail + 1)); fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
root="$work/config"
source="$work/plugin/skills"
mkdir -p "$root/.agents" "$root/.agents/skills/custom" \
    "$source/planning/bin" "$source/review" "$source/empty" "$work/outside"
printf '%s\n' 'name: custom' > "$root/.agents/skills/custom/SKILL.md"
printf '%s\n' 'name: planning' > "$source/planning/SKILL.md"
printf '%s\n' 'planning helper' > "$source/planning/bin/planning-brief"
printf '%s\n' 'name: review' > "$source/review/SKILL.md"
ln -s "$source/planning" "$root/.agents/skills/planning-alias"
printf '%s\n' 'unrelated' > "$work/outside/keep.txt"

boot() {
    if AGENT_STATE_ROOT="$root" AGENT_CONTAINER_SKILLS_SOURCE="$source" \
        bash "$HOOK" >"$work/out" 2>&1; then
        rc=0
    else
        rc=$?
    fi
}
present() { [ -e "$1" ] || [ -L "$1" ]; }

# --- first boot: only plugin skill folders with SKILL.md are linked -----------

boot
assert "a first boot succeeds" "$rc" "0"
for name in planning review; do
    assert "$name is linked from the image source" "$( [ -L "$root/.agents/skills/$name" ] && echo yes || echo no )" "yes"
    assert "$name resolves to its source" "$(readlink "$root/.agents/skills/$name" 2>/dev/null || true)" "$source/$name"
    assert "$name content is readable through the link" "$(cat "$root/.agents/skills/$name/SKILL.md" 2>/dev/null || true)" "name: $name"
done
assert "a skill's supporting script is reachable through its link" \
    "$(cat "$root/.agents/skills/planning/bin/planning-brief")" "planning helper"
assert "a source folder without SKILL.md is not exposed" "$(present "$root/.agents/skills/empty" && echo yes || echo no)" "no"
assert "an existing user-authored skill is preserved" "$(cat "$root/.agents/skills/custom/SKILL.md")" "name: custom"
assert "a user alias into the plugin source is preserved" \
    "$(readlink "$root/.agents/skills/planning-alias")" "$source/planning"

# --- a repeated boot is stable; a retired skill is reconciled -----------------

rm -rf "$source/review"
mkdir -p "$source/retro"
printf '%s\n' 'name: retro' > "$source/retro/SKILL.md"
boot
assert "a repeated boot succeeds" "$rc" "0"
assert "an unchanged skill keeps the same link" "$(readlink "$root/.agents/skills/planning")" "$source/planning"
assert "a retired plugin skill is removed" "$(present "$root/.agents/skills/review" && echo yes || echo no)" "no"
assert "a new plugin skill is linked on the next boot" "$(readlink "$root/.agents/skills/retro" 2>/dev/null || true)" "$source/retro"

# --- user entries at a colliding name are never overwritten -------------------

rm "$root/.agents/skills/planning"
mkdir -p "$root/.agents/skills/planning"
printf '%s\n' 'name: my-planning' > "$root/.agents/skills/planning/SKILL.md"
mkdir -p "$source/refine" "$work/outside/refine"
printf '%s\n' 'name: refine' > "$source/refine/SKILL.md"
printf '%s\n' 'name: external-refine' > "$work/outside/refine/SKILL.md"
ln -s "$work/outside/refine" "$root/.agents/skills/refine"
boot
assert "a conflicting real skill is not replaced" "$(cat "$root/.agents/skills/planning/SKILL.md")" "name: my-planning"
assert "the real-skill conflict is reported" "$(grep -c 'conflict.*planning' "$work/out" || true)" "1"
assert "a conflicting external symlink is not repointed" "$(readlink "$root/.agents/skills/refine")" "$work/outside/refine"
assert "the symlink conflict is reported" "$(grep -c 'conflict.*refine' "$work/out" || true)" "1"

# --- an incomplete image cleans only its own stale links ----------------------

rm -rf "$source"
boot
assert "a missing image source does not abort boot" "$rc" "0"
assert "the missing image source is named" "$(grep -c 'not in the image' "$work/out" || true)" "1"
assert "a stale image link is removed" "$(present "$root/.agents/skills/retro" && echo yes || echo no)" "no"
assert "user-authored skills survive a missing image source" "$(cat "$root/.agents/skills/custom/SKILL.md")" "name: custom"
assert "a symlink outside the image source survives" "$(readlink "$root/.agents/skills/refine")" "$work/outside/refine"

# --- a user-owned skills root symlink is never followed -----------------------

rm -rf "$root/.agents"
mkdir -p "$work/outside-agent-state/skills"
printf '%s\n' 'keep' > "$work/outside-agent-state/skills/marker"
ln -s "$work/outside-agent-state" "$root/.agents"
boot
assert "a symlinked parent is refused without aborting boot" "$rc" "0"
assert "a symlinked parent is named" "$(grep -c 'refused: .*\.agents.*symlink' "$work/out" || true)" "1"
assert "the external skill directory is untouched" "$(cat "$work/outside-agent-state/skills/marker")" "keep"

rm "$root/.agents"
mkdir -p "$root/.agents"
ln -s "$work/outside-agent-state/skills" "$root/.agents/skills"
boot
assert "a symlinked skills directory is refused" "$rc" "0"
assert "the symlinked skills directory is named" "$(grep -c 'refused: .*\.agents.*symlink' "$work/out" || true)" "1"
assert "the external skill directory remains untouched" "$(cat "$work/outside-agent-state/skills/marker")" "keep"

echo
echo "46-agent-skills.test: $pass passed, $fail failed."
[ "$fail" -eq 0 ]
