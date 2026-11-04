#!/usr/bin/env bash
# custom-cont-init.d script: points the project's git at its .githooks (story
# the-markdown-size-check-runs-on-every-commit-in-a-project, epic qws). Create
# and Configure write .githooks/pre-commit, which runs check-md-size; git only
# runs it once core.hooksPath says so, and that setting is per clone and not
# versioned — so a rule enabled by hand is a rule as real as somebody's memory.
#
# **Only when nothing else was chosen.** A core.hooksPath already set, in the
# project or in the global gitconfig, is somebody's decision (husky, their own
# hooks) and is left alone, said once. Local to the clone: `--file
# .git/config`, never the global config, which every repository shares.
#
# Also, for our own hook only (its marker line): made executable, since a file
# written from the editor's host may arrive without its bit; and a CRLF copy —
# a Windows clone with autocrlf — said, because its shebang is "/bin/sh\r" and
# git would run nothing.
#
# Never fails the boot: s6 restarts what exits, and a hook is not worth a
# container that will not start.
set -uo pipefail

WORKSPACE="${WORKSPACE:-/config/workspace}"
GITCONFIG="${GITCONFIG:-/config/.gitconfig}"
GIT_OWNER="${GIT_OWNER:-abc}"
HOOK="$WORKSPACE/.githooks/pre-commit"
MARKER='# jvsl.env.agents.container: generated.'

say() { echo "[47-git-hooks-path] $*"; }

[ -f "$HOOK" ] || exit 0
if [ ! -d "$WORKSPACE/.git" ]; then
    say "left alone: $WORKSPACE/.git is not a directory (a worktree or a submodule), so its hooks path is not this boot's to set."
    exit 0
fi

if grep -qF -- "$MARKER" "$HOOK"; then
    [ -x "$HOOK" ] || chmod +x "$HOOK" 2>/dev/null || say "could not make $HOOK executable; git will not run it until it is: chmod +x .githooks/pre-commit"
    if grep -q $'\r' "$HOOK"; then
        say "$HOOK has CRLF line endings, so git cannot run it (its shebang reads /bin/sh followed by a carriage return). Add '.githooks/* text eol=lf' to .gitattributes and check it out again."
    fi
fi

local_path="$(git config --file "$WORKSPACE/.git/config" --get core.hooksPath 2>/dev/null || true)"
global_path="$(git config --file "$GITCONFIG" --get core.hooksPath 2>/dev/null || true)"
[ "$local_path" = ".githooks" ] && exit 0
if [ -n "$local_path" ]; then
    say "kept: this project's core.hooksPath is $local_path, chosen by somebody, so .githooks is not turned on. Its pre-commit runs check-md-size; call it from your hooks to keep the Markdown size rule."
    exit 0
fi
if [ -n "$global_path" ]; then
    say "kept: core.hooksPath is $global_path in $GITCONFIG, chosen by somebody, so .githooks is not turned on for this project."
    exit 0
fi

if git config --file "$WORKSPACE/.git/config" core.hooksPath .githooks 2>/dev/null; then
    if [ "$(id -u)" = 0 ] && id "$GIT_OWNER" >/dev/null 2>&1; then chown "$GIT_OWNER:$GIT_OWNER" "$WORKSPACE/.git/config" 2>/dev/null || true; fi
    say "turned on: this project's git runs .githooks, whose pre-commit holds Markdown files under the size limit."
else
    say "could not set core.hooksPath in $WORKSPACE/.git/config; the pre-commit hook will not run until: git config core.hooksPath .githooks"
fi
exit 0
