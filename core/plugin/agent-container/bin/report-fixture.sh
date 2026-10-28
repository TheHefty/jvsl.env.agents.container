# shellcheck shell=bash
# Sourced by the project report's tests: a throwaway repository with a few
# tracked files, and a well-formed report about it.
#   repo <dir>     a git repository with src/app.js, docs/adr/001.md, README.md, committed
#   report         a report that report-check accepts, about that repository
repo() {
    git init -q "$1"
    mkdir -p "$1/src" "$1/docs/adr"
    printf 'export const port = 8080\n' > "$1/src/app.js"
    printf '# 001 Use SQLite\nBecause one file is enough here.\n' > "$1/docs/adr/001.md"
    printf '# demo\n' > "$1/README.md"
    git -C "$1" add -A && git -C "$1" -c user.name=t -c user.email=t@t commit -q -m init
}
report() {
    cat <<'MD'
# Project report

## Overview

- A web service on port 8080, in `src/app.js`.
- Most likely deployed as a container (inference)

## Decisions

### Documented

- SQLite for storage — Source: `docs/adr/001.md` — Reason: one file is enough here.

### Implicit

- Port 8080 — In: `src/app.js:1` — Alternatives: an environment variable — Cost of change: low.

## Critical areas

- Configuration is a constant in `src/app.js`, with no secret in it.

## Quality and tests

- No test exists for `src/app.js`.

## Study list

- How the port reaches the container, from `src/app.js`.

## Topics to write about

- Constants where configuration should be — Files: `src/app.js`, `README.md`
MD
}
