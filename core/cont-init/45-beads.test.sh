#!/usr/bin/env bash
# Exercises the beads boot hook against a real git repository, through a
# privilege wrapper that records and then runs, and the faithful bd stand-in.
#
# **What this owns is two decisions:** whether a project asked for a tracker at
# all, and which of four paths a boot takes. The cost of the first being wrong is
# a tracker in somebody's repository that nobody asked for. The cost of the
# second, measured on 2026-10-06, is `bd init` committing on its own and
# sweeping in whatever the person had staged.
#
# **The stand-in commits the way bd does**, so a hook that let `bd init` run in
# the workspace fails here rather than in somebody's repository. See
# core/booted.test.fixture/bd-stub.sh for what was measured.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/45-beads.sh"
STUB="$HERE/../booted.test.fixture/bd-stub.sh"

failures=0
check() {
    if [ "$2" = "$3" ]; then
        echo "ok   $1"
    else
        echo "FAIL $1"
        echo "     expected: $3"
        echo "     got:      $2"
        failures=$((failures + 1))
    fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"

# s6-setuidgid is what makes everything belong to abc rather than to root. It
# records, then runs the rest: the git operations have to really happen for the
# assertions about HEAD and the index to mean anything.
cat > "$work/bin/s6-setuidgid" <<'SH'
#!/usr/bin/env bash
echo "s6-setuidgid $* [in $PWD]" >> "$CALLS"
shift
UNDER_S6=1 exec "$@"
SH
# bd records every call with the directory it ran in, then defers to the stub.
cat > "$work/bin/bd" <<SH
#!/usr/bin/env bash
echo "bd \$* [in \$PWD]\${UNDER_S6:+ as-abc}" >> "\$CALLS"
exec sh "$STUB" "\$@"
SH
chmod +x "$work/bin/"*
export PATH="$work/bin:$PATH"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

ws="$work/ws"
CALLS="$work/calls"; export CALLS

fresh_repo() {
    rm -rf "$ws" "$work/origin.git"; mkdir -p "$ws"
    git init -q --bare "$work/origin.git"
    git -C "$ws" init -q
    git -C "$ws" remote add origin "$work/origin.git"
    echo a > "$ws/tracked.txt"
    git -C "$ws" add tracked.txt
    git -C "$ws" -c user.name=t -c user.email=t@t commit -q -m root
    printf '%s' "$1" > "$ws/.agent-container.stack.json"
}

stage_work() {
    echo "the person's" > "$ws/staged.txt"
    git -C "$ws" add staged.txt
}

boot() {
    : > "$CALLS"
    BEADS_WORKSPACE="$ws" timeout 60 bash "$SCRIPT" > "$work/out" 2>&1
    echo $? > "$work/rc"
}

snapshot() { echo "$(git -C "$ws" rev-parse HEAD) $(git -C "$ws" ls-files --stage | sha256sum)"; }

# --- the shapes that must read as no ----------------------------------------

for manifest in 'none' 'this is not json' '{"node":"22"}' '{"beads":false}'; do
    rm -rf "$ws"; mkdir -p "$ws"
    [ "$manifest" = none ] || printf '%s' "$manifest" > "$ws/.agent-container.stack.json"
    boot
    check "no tracker for a manifest of: $manifest" "$(cat "$CALLS")" ""
done

# --- a yes outside a git repository -----------------------------------------
#
# The tracker travels by the project's git remote, and bd would run `git init`
# in a directory that is not a repository. Neither is this hook's to do.
rm -rf "$ws"; mkdir -p "$ws"; printf '{"beads":true}' > "$ws/.agent-container.stack.json"
boot
check "outside a git repository, bd is never called" "$(grep -c '^bd ' "$CALLS" || true)" "0"
check "and the boot log says why" "$(grep -c 'not a git repository' "$work/out" || true)" "1"
check "and the boot continues" "$(cat "$work/rc")" "0"

# --- the first opt-in -------------------------------------------------------

fresh_repo '{"beads":true}'
stage_work
before="$(snapshot)"
boot
check "a first opt-in exits 0" "$(cat "$work/rc")" "0"
check "makes no commit and leaves the index byte-identical" "$(snapshot)" "$before"
check "and what the person staged is still staged, alone" \
    "$(git -C "$ws" diff --cached --name-only)" "staged.txt"
check "bd init never runs in the workspace" \
    "$(grep '^bd init' "$CALLS" | grep -c "\[in $ws\]" || true)" "0"
check "bd init runs somewhere else exactly once" "$(grep -c '^bd init' "$CALLS" || true)" "1"
check "with --skip-agents and --skip-hooks" \
    "$(grep '^bd init' "$CALLS" | grep -c -- '--skip-agents.*--skip-hooks\|--skip-hooks.*--skip-agents' || true)" "1"
check "and the project's name as its prefix" \
    "$(grep '^bd init' "$CALLS" | grep -c -- '--prefix origin' || true)" "1"
check "the workspace has a working tracker" "$([ -d "$ws/.beads/embeddeddolt" ] && echo yes || echo no)" "yes"
check "whose remote is the project's origin" \
    "$(grep -c "remote: $work/origin.git" "$ws/.beads/config.yaml" || true)" "1"
check "nothing for agents, editors or git hooks was installed" \
    "$(cd "$ws" && ls -d CLAUDE.md AGENTS.md .claude .codex .cursor .agents 2>/dev/null | wc -l)" "0"
check "core.hooksPath is untouched" "$(git -C "$ws" config core.hooksPath || echo unset)" "unset"
check "beads.role is set, so bd does not warn on every command" \
    "$(git -C "$ws" config beads.role || echo unset)" "maintainer"
check "bd's ignore lines are in .gitignore once" \
    "$(grep -c '^\*\.gate\.lock\*$' "$ws/.gitignore" || true)" "1"
check "every bd call ran as abc, never as root" \
    "$(grep '^bd ' "$CALLS" | grep -vc ' as-abc$' || true)" "0"
check "and the new files are named in the boot log for the person to commit" \
    "$(grep -c 'not committed' "$work/out" || true)" "1"

# --- a second boot changes nothing ------------------------------------------

before="$(snapshot)"
boot
check "a second boot calls no bd at all" "$(grep -c '^bd ' "$CALLS" || true)" "0"
check "and changes nothing" "$(snapshot)" "$before"

# --- a fresh clone: .beads/ tracked, no local database -----------------------

git -C "$ws" restore --staged staged.txt; rm -f "$ws/staged.txt"
git -C "$ws" add .beads .gitignore
git -C "$ws" -c user.name=t -c user.email=t@t commit -q -m "track the tracker"
rm -rf "$ws/.beads/embeddeddolt"
git -C "$ws" config --unset beads.role
stage_work
before="$(snapshot)"
boot
check "a clone is restored with bd bootstrap" "$(grep -c '^bd bootstrap' "$CALLS" || true)" "1"
check "and never with bd init" "$(grep -c '^bd init' "$CALLS" || true)" "0"
check "makes no commit and leaves the index byte-identical" "$(snapshot)" "$before"
check "has a database afterwards" "$([ -d "$ws/.beads/embeddeddolt" ] && echo yes || echo no)" "yes"
check "and beads.role" "$(git -C "$ws" config beads.role || echo unset)" "maintainer"
# Measured: bd warns on every command when .beads/ is 0755, which is what a
# checkout gives it. A tracker that warns on every command is scenario 3.
check "and .beads/ is 0700, so bd does not warn on every command" "$(stat -c %a "$ws/.beads")" "700"

# --- a bootstrap that hangs or fails does not take the boot with it ----------

for mode in hang fail; do
    rm -rf "$ws/.beads/embeddeddolt"
    start=$(date +%s)
    export STUB_BOOTSTRAP=$mode BEADS_BOOTSTRAP_TIMEOUT=2
    boot
    unset STUB_BOOTSTRAP BEADS_BOOTSTRAP_TIMEOUT
    took=$(( $(date +%s) - start ))
    check "a bootstrap that is told to $mode: the boot continues" "$(cat "$work/rc")" "0"
    check "a bootstrap that is told to $mode: within its bound" "$([ "$took" -lt 15 ] && echo yes || echo "no, ${took}s")" "yes"
    check "a bootstrap that is told to $mode: one line says the tracker is empty and why" \
        "$(grep -c 'tracker' "$work/out" | awk '{print ($1 >= 1) ? "said" : "silent"}')" "said"
done

echo
if [ "$failures" -eq 0 ]; then
    echo "45-beads.test: all checks passed."
else
    echo "45-beads.test: $failures failed." >&2
    exit 1
fi
