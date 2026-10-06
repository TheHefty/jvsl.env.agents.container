#!/usr/bin/env bash
# Exercises the beads boot hook through a fake privilege wrapper and a fake bd.
#
# **What this owns is the decision, not the initialisation.** `bd init` is the
# tool's; what the hook decides is whether a project asked for one at all, and
# the cost of getting that wrong is a database and a .gitignore entry written
# into somebody's repository by something they did not run.
#
# So every shape that is not an explicit yes has its own case: no manifest, a
# manifest that does not parse, one without the field, and one that says no.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/45-beads.sh"

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

# s6-setuidgid is what makes the database belong to abc rather than to root.
# Recording the whole invocation is the point: a hook that calls `bd` directly
# would pass every other assertion here.
cat > "$work/bin/s6-setuidgid" <<'SH'
#!/usr/bin/env bash
echo "s6-setuidgid $*" >> "$CALLS"
SH
cat > "$work/bin/bd" <<'SH'
#!/usr/bin/env bash
echo "bd-called-directly $*" >> "$CALLS"
SH
chmod +x "$work/bin/"*
export PATH="$work/bin:$PATH"

run_with() {
    # $1 is what to write as the manifest, or the word 'none' for no file.
    local workspace="$work/ws"
    rm -rf "$workspace"; mkdir -p "$workspace"
    [ "$1" = "none" ] || printf '%s' "$1" > "$workspace/.agent-container.stack.json"
    CALLS="$work/calls"; export CALLS
    : > "$CALLS"
    BEADS_WORKSPACE="$workspace" bash "$SCRIPT" >/dev/null 2>&1 || true
    cat "$CALLS"
}

# --- the four shapes that must read as no ----------------------------------

check "no manifest at all initialises nothing" \
    "$(run_with none)" ""

check "a manifest that does not parse initialises nothing" \
    "$(run_with 'this is not json')" ""

check "a manifest without the field initialises nothing" \
    "$(run_with '{"node":"22"}')" ""

check "a manifest that says no initialises nothing" \
    "$(run_with '{"beads":false}')" ""

# --- and the one that must read as yes -------------------------------------

out="$(run_with '{"beads":true}')"
check "a manifest that asks for it initialises one" \
    "$([ -n "$out" ] && echo yes || echo no)" "yes"

check "and does it as abc, never as root" \
    "$(printf '%s' "$out" | grep -c '^s6-setuidgid abc')" "1"

check "so bd is never invoked directly" \
    "$(printf '%s' "$out" | grep -c 'bd-called-directly' || true)" "0"

# **The second boot, which the first version of this hook failed.** `bd init`
# exits 1 against a workspace that already has one — measured, not read: run
# twice in a scratch directory it aborts with "If the database is genuinely
# corrupt and unrecoverable". The hook runs on every boot, so without
# --init-if-missing an opted-in project's second start fails under `set -e`.
check "and asks bd to skip rather than fail when there is already one" \
    "$(printf '%s' "$out" | grep -c -- '--init-if-missing')" "1"

echo
if [ "$failures" -eq 0 ]; then
    echo "45-beads.test: all checks passed."
else
    echo "45-beads.test: $failures failed." >&2
    exit 1
fi
