#!/bin/sh
# A stand-in for `bd`, faithful to the behaviours the beads boot hook depends on.
#
# **Every behaviour here was measured from the real binary (v1.3.1), not
# guessed**, because a stand-in that is kinder than the tool passes a hook that
# fails against it. Each of these was the difference once:
#
# - `bd init` **commits on its own**, and the commit is a plain `git commit` of
#   the index, so it sweeps in whatever the person had staged. Measured in a
#   first opt-in and again in a fresh clone.
# - Without `--skip-agents` it writes CLAUDE.md and .claude/settings.json (a
#   SessionStart hook running `bd prime`). Without `--skip-hooks` it repoints
#   core.hooksPath at .beads/hooks.
# - A second `bd init` exits 1, unless `--init-if-missing` is passed.
# - `bd bootstrap` restores or creates a database and **never commits**.
# - `-C` refuses a directory that is not already a project.
# - The database is a directory named by metadata.json's `dolt_database`,
#   under .beads/embeddeddolt/, and is whole when it has .dolt/repo_state.json
#   (measured on this repository's own tracker, 2026-10-08).
#
# STUB_BOOTSTRAP=hang or STUB_BOOTSTRAP=fail makes bootstrap do that, for the
# hook's network failure scenario.
set -u

if [ "${1:-}" = "-C" ]; then
    cd "$2" || exit 1
    shift 2
    [ -d .beads ] || { echo "bd: cannot use -C directory: no beads project found" >&2; exit 1; }
fi

cmd="${1:-}"
[ $# -gt 0 ] && shift
ALL_ARGS="$*"
has() { case " $* " in *" $FLAG "*) return 0 ;; *) return 1 ;; esac; }

prefix_of() {
    sed -n 's/^issue-prefix: *"\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' .beads/config.yaml 2>/dev/null | head -1
}

case "$cmd" in
    init)
        if [ -d .beads/embeddeddolt ]; then
            FLAG=--init-if-missing; has "$@" && exit 0
            echo "bd: workspace already initialized" >&2; exit 1
        fi
        prefix="$(basename "$PWD")"
        while [ $# -gt 0 ]; do
            [ "$1" = "--prefix" ] && prefix="$(printf '%s' "$2" | tr . _)"
            shift
        done
        mkdir -p ".beads/embeddeddolt/$prefix/.dolt"
        printf '{}\n' > ".beads/embeddeddolt/$prefix/.dolt/repo_state.json"
        printf '*.db\nembeddeddolt/\n' > .beads/.gitignore
        printf 'issue-prefix: "%s"\n' "$prefix" > .beads/config.yaml
        origin="$(git remote get-url origin 2>/dev/null || true)"
        [ -n "$origin" ] && printf 'sync:\n    remote: %s\n' "$origin" >> .beads/config.yaml
        printf '{"database":"dolt","backend":"dolt","dolt_mode":"embedded","dolt_database":"%s"}\n' "$prefix" > .beads/metadata.json
        printf '# Beads / Dolt files (added by bd init)\n.dolt/\n*.db\n.beads-credential-key\n.beads/proxieddb/\n*.gate.lock*\n' >> .gitignore
        FLAG=--skip-agents
        if ! has $ALL_ARGS; then
            printf '<!-- BEGIN BEADS INTEGRATION -->\n' >> CLAUDE.md
            mkdir -p .claude && printf '{"hooks":{"SessionStart":[{"hooks":[{"command":"bd prime --hook-json"}]}]}}\n' > .claude/settings.json
        fi
        FLAG=--skip-hooks
        has $ALL_ARGS || git config core.hooksPath .beads/hooks
        for f in .beads .gitignore CLAUDE.md .claude; do [ -e "$f" ] && git add "$f"; done
        git -c user.name=bd -c user.email=bd@localhost commit -q -m "bd init: initialize beads issue tracking" >/dev/null 2>&1 || true
        ;;
    bootstrap)
        case "${STUB_BOOTSTRAP:-}" in
            hang) sleep 600 ;;
            fail) echo "bd: bootstrap: could not reach the remote" >&2; exit 1 ;;
        esac
        # Measured: against a remote whose host does not resolve, the real
        # bootstrap exits 1 at once, naming the host, and creates nothing.
        if grep -q 'example\.invalid' .beads/config.yaml 2>/dev/null; then
            echo "fatal: unable to access the remote: Could not resolve host: example.invalid" >&2
            exit 1
        fi
        db="$(sed -n 's/.*"dolt_database": *"\([^"]*\)".*/\1/p' .beads/metadata.json 2>/dev/null)"
        mkdir -p ".beads/embeddeddolt/${db:-beads}/.dolt"
        printf '{}\n' > ".beads/embeddeddolt/${db:-beads}/.dolt/repo_state.json"
        ;;
    create)
        [ -d .beads/embeddeddolt ] || { echo "bd: no beads database found" >&2; exit 1; }
        id="$(prefix_of)-$(date +%s%N | tail -c 4)"
        printf '%s\t%s\n' "$id" "$1" >> .beads/embeddeddolt/items
        [ -z "$(git config beads.role 2>/dev/null)" ] && echo "warning: beads.role not configured (GH#2950)." >&2
        echo "Created issue: $id"
        ;;
    list)
        [ -d .beads/embeddeddolt ] || { echo "bd: no beads database found" >&2; exit 1; }
        [ -z "$(git config beads.role 2>/dev/null)" ] && echo "warning: beads.role not configured (GH#2950)." >&2
        cat .beads/embeddeddolt/items 2>/dev/null
        ;;
    *)
        echo "bd stub: unsupported command '$cmd'" >&2; exit 2 ;;
esac
