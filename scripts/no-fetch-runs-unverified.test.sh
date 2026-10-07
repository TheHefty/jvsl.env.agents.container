#!/usr/bin/env bash
# No image fragment runs code it downloaded without verifying it.
#
# **The inherited rule is "pin a version and verify a digest".** Until
# 2026-10-07 four fetches broke it, three of them executing a downloaded script
# as root: nodesource's setup_N.x and sh.rustup.rs piped into a shell, and
# ruby-build cloned from whatever master was that day. The debt is
# six-build-time-fetches-verify-nothing in the tracker.
#
# Two shapes are refused in every Dockerfile.frag, after joining continued
# lines and dropping comments:
#   - curl or wget piped into sh or bash;
#   - git clone, which fetches whatever a branch points at today;
#   - curl or wget piped into tar, which unpacks an archive before anything
#     checked it (added with the Go and Android task, the debt's second half).
# A download is fine; executing it unverified is not.
#
# FETCH_GUARD_ROOT points this at another tree, which is how each shape was
# first seen to fail it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${FETCH_GUARD_ROOT:-$(cd "$HERE/.." && pwd)}"

mapfile -t frags < <(find "$ROOT/core" "$ROOT/stacks" -name 'Dockerfile.frag' 2>/dev/null | sort)
if [ "${#frags[@]}" -lt 5 ]; then
    echo "no-fetch-runs-unverified: FAIL: found ${#frags[@]} fragment(s) under $ROOT; this check is not \
reading the tree it thinks it is." >&2
    exit 1
fi
echo "ok      ${#frags[@]} fragment(s) to check"

bad=""
for f in "${frags[@]}"; do
    # One logical line per instruction: drop comments, then join continuations.
    joined="$(grep -vE '^[[:space:]]*#' "$f" | sed -e ':a' -e '/\\$/N; s/\\\n//; ta')"
    piped="$(printf '%s\n' "$joined" | grep -E '(curl|wget)[^;&]*\|[[:space:]]*(sudo[[:space:]]+)?(ba)?sh\b' || true)"
    cloned="$(printf '%s\n' "$joined" | grep -E '\bgit[[:space:]]+clone\b' || true)"
    untarred="$(printf '%s\n' "$joined" | grep -E '(curl|wget)[^;&]*\|[[:space:]]*tar\b' || true)"
    rel="${f#"$ROOT"/}"
    [ -z "$piped" ] || bad+="$rel: pipes a download into a shell"$'\n'
    [ -z "$cloned" ] || bad+="$rel: runs git clone, which fetches whatever a branch points at today"$'\n'
    [ -z "$untarred" ] || bad+="$rel: pipes a download into tar, unpacking it before anything checked it"$'\n'
done

if [ -n "$bad" ]; then
    echo "no-fetch-runs-unverified: FAIL: code downloaded at build time would run unverified:" >&2
    while IFS= read -r line; do [ -n "$line" ] && printf '        %s\n' "$line" >&2; done <<<"$bad"
    echo "        Download to a file, check it against a pinned sha256, then run it; or do by hand what \
the script does, as the php and node fragments do for their apt sources." >&2
    exit 1
fi
echo "ok      no fragment pipes a download into a shell or clones a moving branch"
echo
echo "no-fetch-runs-unverified.test: 2 passed, 0 failed."
