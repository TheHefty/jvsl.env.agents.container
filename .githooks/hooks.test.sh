#!/usr/bin/env bash
# The repository's own git hooks, driven as git would run them.
#
# Story lint-and-hooks-guard-every-change. Two of its three failure scenarios
# live here:
#
#   - **a hook passes because its tool is missing.** A lint that skips what it
#     cannot find reports clean; a hook that skips a step it cannot run lets the
#     change through. Each missing tool has to stop the hook and say what is
#     missing and how to get it.
#   - **a step fails and the hook still lets the change through.** A pipe or a
#     missing `set -e` swallows an exit code. So npm is a stand-in that fails one
#     step at a time, and every failure has to refuse, naming the step.
#
# HOOKS_ROOT points the hooks at a scratch tree; the npm stand-in records what
# it was asked to run, so the order and the steps are asserted too.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/root/node_modules"

cat > "$work/bin/npm" <<'SH'
#!/usr/bin/env bash
# Records `npm ... run <step>` and fails when the step is the one asked to fail.
step="${!#}"
echo "$step" >> "$CALLS"
[ "${FAIL_STEP:-}" = "$step" ] && { echo "npm stand-in: $step failed" >&2; exit 1; }
exit 0
SH
cat > "$work/bin/check-md-size" <<'SH'
#!/usr/bin/env bash
echo "check-md-size $*" >> "$CALLS"
[ "${FAIL_STEP:-}" = "check-md-size" ] && exit 1
exit 0
SH
chmod +x "$work/bin/"*

CALLS="$work/calls"; export CALLS
run_hook() {
    : > "$CALLS"
    set +e
    HOOKS_ROOT="$work/root" PATH="$work/bin:$PATH" bash "$HERE/$1" > "$work/out" 2>&1
    echo $? > "$work/rc"
    set -e
}

# --- pre-commit ----------------------------------------------------------------

run_hook pre-commit
check "pre-commit: a clean tree passes" "$(cat "$work/rc")" "0"
check "pre-commit: the size check, then the lint" "$(tr '\n' ' ' < "$CALLS")" "check-md-size --root $work/root lint "

for step in check-md-size lint; do
    FAIL_STEP=$step run_hook pre-commit
    check "pre-commit: a failing $step refuses the commit" "$(cat "$work/rc")" "1"
    check "pre-commit: and says $step failed" "$(grep -c "refused.*$step" "$work/out" || true)" "1"
done

rm -rf "$work/root/node_modules"
run_hook pre-commit
check "pre-commit: without node_modules, refuses rather than skipping the lint" "$(cat "$work/rc")" "1"
check "pre-commit: and says to run npm ci" "$(grep -c 'npm ci' "$work/out" || true)" "1"
mkdir -p "$work/root/node_modules"

# Without check-md-size on PATH: a PATH holding only the npm stand-in and the
# system's own tools.
mkdir -p "$work/nomd"; cp "$work/bin/npm" "$work/nomd/npm"
: > "$CALLS"; set +e
HOOKS_ROOT="$work/root" PATH="$work/nomd:/usr/bin:/bin" bash "$HERE/pre-commit" > "$work/out" 2>&1; echo $? > "$work/rc"; set -e
check "pre-commit: without check-md-size, refuses" "$(cat "$work/rc")" "1"
check "pre-commit: and names it" "$(grep -c 'check-md-size is not on PATH' "$work/out" || true)" "1"

# --- pre-push ------------------------------------------------------------------

run_hook pre-push
check "pre-push: a good tree passes" "$(cat "$work/rc")" "0"
check "pre-push: typecheck, unit tests, then the build and bundle" "$(tr '\n' ' ' < "$CALLS")" "typecheck test test:bundle "

for step in typecheck test test:bundle; do
    FAIL_STEP=$step run_hook pre-push
    check "pre-push: a failing $step refuses the push" "$(cat "$work/rc")" "1"
    check "pre-push: and names $step" "$(grep -c "refused: npm run $step failed" "$work/out" || true)" "1"
done

rm -rf "$work/root/node_modules"
run_hook pre-push
check "pre-push: without node_modules, refuses and says to run npm ci" "$(cat "$work/rc") $(grep -c 'npm ci' "$work/out" || true)" "1 1"

# --- the shell lint without shellcheck -----------------------------------------

set +e
SHELLCHECK="$work/no-such-shellcheck" bash "$REPO/scripts/lint-shell.sh" > "$work/out" 2>&1; rc=$?
set -e
check "lint-shell: without shellcheck, fails rather than reporting clean" "$rc" "1"
check "lint-shell: and says what is missing and how to get it" "$(grep -c 'shellcheck is not installed' "$work/out" || true)" "1"

# A shellcheck of another version: the hook and CI would disagree about what is
# a finding, so the lint refuses it and names the version it expects.
pinned="$(cut -d' ' -f1 "$REPO/core/shellcheck.pin")"
cat > "$work/bin/old-shellcheck" <<'SH'
#!/usr/bin/env bash
[ "${1:-}" = "--version" ] && { printf 'ShellCheck - shell script analysis tool\nversion: 0.9.0\n'; exit 0; }
exit 0
SH
chmod +x "$work/bin/old-shellcheck"
set +e
SHELLCHECK="$work/bin/old-shellcheck" bash "$REPO/scripts/lint-shell.sh" > "$work/out" 2>&1; rc=$?
set -e
check "lint-shell: another shellcheck version refuses" "$rc" "1"
check "lint-shell: and names the pinned one it expects" "$(grep -c "expects shellcheck $pinned.*got 0.9.0" "$work/out" || true)" "1"

echo
if [ "$failures" -eq 0 ]; then
    echo "hooks.test: all checks passed."
else
    echo "hooks.test: $failures failed." >&2
    exit 1
fi
