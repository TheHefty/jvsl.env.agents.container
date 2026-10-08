#!/usr/bin/env bash
# The extension never removes a container itself.
#
# **Recreating a container ends everything running inside it**, agent sessions
# included. After a build, the extension offers Dev Containers' own rebuild,
# run when the person clicks it (the debt
# a-rebuilt-image-does-not-reach-the-running-container in the tracker). A
# `docker rm` or `docker container rm` in the extension's code would be a
# removal nobody chose.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${NO_RM_GUARD_ROOT:-$(cd "$HERE/.." && pwd)}"
# git ls-files, not a shell glob: it sees sources in src/'s folders too
# (scripts/every-source-is-read.test.sh).
mapfile -t sources < <(git -C "$ROOT" ls-files 'src/*.ts' | grep -vE '\.test\.ts$' | sed "s#^#$ROOT/#" || true)
[ "${#sources[@]}" -ge 5 ] || { echo "no-container-is-removed: FAIL: found ${#sources[@]} source file(s); the check would pass vacuously." >&2; exit 1; }
hits="$(grep -nE "\['(rm|kill)'|'container',[[:space:]]*'(rm|kill)'|docker (container )?(rm|kill)\b" "${sources[@]}" \
    | grep -vE ':[0-9]+:[[:space:]]*(//|\*)' || true)"
if [ -n "$hits" ]; then
    echo "no-container-is-removed: FAIL: the extension removes or kills a container itself:" >&2
    printf '        %s\n' "$hits" >&2
    exit 1
fi
echo "no-container-is-removed.test: no container is removed by the extension."
