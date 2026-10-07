#!/usr/bin/env bash
# Every Go version the stack offers has a pinned digest, and no digest is
# orphaned.
#
# **Why:** the fragment refuses a version with no digest, at build time. A
# version added to versions.json without one would only fail when somebody
# picks it, far from the change that caused it, and the easiest "fix" there
# is to skip the check. This makes the two files disagree in CI instead.
# Digests are measured with sha256sum on the downloaded archive, never
# transcribed; see digests.json.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
versions="$(jq -r '.[]' "$HERE/versions.json" | sort)"
digests="$(jq -r 'keys[] | select(. != "_comment")' "$HERE/digests.json" 2>/dev/null | sort || true)"
if [ "$versions" != "$digests" ]; then
    echo "golang digests.test: FAIL: versions.json and digests.json disagree:" >&2
    diff <(printf '%s\n' "$versions") <(printf '%s\n' "$digests") | sed 's/^/    /' >&2 || true
    echo "    Each listed version needs its archive's sha256 in stacks/golang/digests.json, measured with sha256sum." >&2
    exit 1
fi
bad="$(jq -r 'to_entries[] | select(.key != "_comment") | select(.value | test("^[0-9a-f]{64}$") | not) | .key' "$HERE/digests.json")"
[ -z "$bad" ] || { echo "golang digests.test: FAIL: not a sha256 for: $bad" >&2; exit 1; }
echo "golang digests.test: $(printf '%s\n' "$versions" | wc -l) version(s), each with a sha256."
