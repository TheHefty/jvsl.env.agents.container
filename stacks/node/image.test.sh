#!/usr/bin/env bash
# Runs INSIDE a built node-stack image. Asserts that Node.js is the version the
# stack asked for, and that it came from nodesource's source signed by the key
# this repository carries.
#
# **Why this exists:** until 2026-10-07 the fragment piped nodesource's
# setup_N.x into bash as root. It now writes the apt source by hand
# (the debt six-build-time-fetches-verify-nothing in the tracker). A
# hand-written source that drifts fails in one of two quiet ways: apt finds
# nothing and the build fails far from the cause, or apt installs Debian's own
# older nodejs and every check that only asks "is node there" passes. This asks
# which node, and from where.
#
# Run by .github/workflows/ci.yml's stack-build job, which builds the lowest
# version listed in versions.json; the mount gives this file that list.
set -uo pipefail
failures=0
fail() { echo "FAIL $*"; failures=$((failures + 1)); }

want="$(jq -r 'map(tonumber) | min' /image-test/versions.json)"
got="$(node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')"
[ "$got" = "$want" ] && echo "ok   node is major $want" \
    || fail "node is major '${got:-absent}', expected $want: the hand-written nodesource source did not deliver the stack's version"

src=/etc/apt/sources.list.d/nodesource.sources
grep -q "^URIs: https://deb.nodesource.com/node_${want}.x$" "$src" 2>/dev/null && echo "ok   the source is nodesource's node_${want}.x" \
    || fail "$src does not point at node_${want}.x"
grep -q '^Signed-By: /usr/share/keyrings/nodesource.asc$' "$src" 2>/dev/null && echo "ok   the source is signed by the vendored key" \
    || fail "$src is not signed by /usr/share/keyrings/nodesource.asc"

origin="$(apt-cache policy nodejs 2>/dev/null | awk '/\*\*\*/{getline; print; exit}')"
case "$origin" in
    *deb.nodesource.com*) echo "ok   the installed nodejs came from nodesource" ;;
    *) fail "the installed nodejs did not come from deb.nodesource.com: $origin" ;;
esac

[ "$failures" -eq 0 ] && echo "node image.test: all checks passed." || { echo "node image.test: $failures failed."; exit 1; }
