#!/usr/bin/env bash
# Drives the real 45-agent-state-dirs.sh against a root this test builds.
#
# ai-jail maps an agent's state into the sandbox only if the directory already
# exists, so a missing one is an agent that starts at onboarding on every run
# with nothing saying why (debt agent-state-directory-is-lost-under-the-mount).
# OpenCode keeps its login under ~/.local/share/opencode and its config under
# ~/.config/opencode (story opencode-is-installed-and-runs-sandboxed-keeping-its-login).
# Codex and OpenCode discover the image's shared skills under ~/.agents/skills.
#
# Its three worst failures, each a case below:
#   1. a state directory missing at boot, so the login is lost on every run;
#   2. a parent it creates (~/.config, ~/.local) owned by root, so every other
#      tool that writes there fails;
#   3. an existing directory, or what is in it, disturbed on a later boot.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$HERE/45-agent-state-dirs.sh"

pass=0
fail=0
assert() {
    if [ "$2" = "$3" ]; then echo "ok      $1"; pass=$((pass + 1)); else
        echo "NOT OK  $1" >&2; echo "        expected: $3" >&2; echo "        got:      $2" >&2; fail=$((fail + 1)); fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
# chown is the root-only step: recorded here, so ownership is asserted by what
# the hook asked for, on a runner where it cannot be done.
cat > "$work/bin/chown" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CHOWNS"
SH
chmod +x "$work/bin/chown"
export CHOWNS="$work/chowns"

root="$work/config"
boot() { : > "$CHOWNS"; AGENT_STATE_ROOT="$root" PATH="$work/bin:$PATH" bash "$HOOK" > "$work/out" 2>&1; echo $? > "$work/rc"; }
owned() { grep -cx -- "abc:abc $1" "$CHOWNS" || true; }

# --- a first boot: nothing there ------------------------------------------------

rm -rf "$root"; mkdir -p "$root"
boot
assert "a first boot succeeds" "$(cat "$work/rc")" "0"
for d in .claude .codex .agents .config/opencode .local/share/opencode; do
    assert "it creates $d" "$([ -d "$root/$d" ] && echo yes || echo no)" "yes"
done
for d in .config .config/opencode .local .local/share .local/share/opencode .claude .codex .agents; do
    assert "$d, created here, is abc's" "$(owned "$root/$d")" "1"
done

# --- a later boot: everything there, some of it not created by this hook ---------

rm -rf "$root"; mkdir -p "$root/.config/someone-else" "$root/.local/share"
echo secret > "$root/.config/someone-else/token"
boot
assert "an existing ~/.config is not handed to anyone" "$(owned "$root/.config")" "0"
assert "nor an existing ~/.local or ~/.local/share" "$(( $(owned "$root/.local") + $(owned "$root/.local/share") ))" "0"
assert "what was in it is untouched" "$(cat "$root/.config/someone-else/token")" "secret"
assert "the opencode directories it did create are abc's" \
    "$(( $(owned "$root/.config/opencode") + $(owned "$root/.local/share/opencode") ))" "2"
assert "the shared agent directory it did create is abc's" "$(owned "$root/.agents")" "1"
assert "no chown is recursive" "$(grep -c -- '-R' "$CHOWNS" || true)" "0"

# --- a pre-existing symlink is not followed or chowned ------------------------

rm -rf "$root" "$work/external-agent-state"
mkdir -p "$root" "$work/external-agent-state"
printf '%s\n' 'keep' > "$work/external-agent-state/marker"
ln -s "$work/external-agent-state" "$root/.agents"
boot
assert "a symlinked shared agent root is left intact" "$( [ -L "$root/.agents" ] && echo yes || echo no )" "yes"
assert "the symlink target is untouched" "$(cat "$work/external-agent-state/marker")" "keep"
assert "the symlink target is never chowned" "$(owned "$root/.agents")" "0"
assert "the refused symlink is named" "$(grep -c 'refused: .*\.agents is a symlink' "$work/out" || true)" "1"

echo
echo "45-agent-state-dirs.test: $pass passed, $fail failed."
[ "$fail" -eq 0 ]
