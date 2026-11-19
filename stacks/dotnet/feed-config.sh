#!/usr/bin/env bash
# feed-config.sh <url> <out> <distribution>: fetches Microsoft's apt config
# package for the .NET SDK feed, and on failure says which failure it was.
#
# Debt the-dotnet-stack-reports-any-feed-failure-as-an-unsupported-
# distribution (z1k). The fetch used to be `if ! curl -fsSL ...` in the
# fragment, and every failure printed "Microsoft publishes no apt config for
# <distribution>". On 2026-11-18 a 429 from packages.microsoft.com printed
# exactly that, in CI run 44342536225: a rate limit read as an unsupported
# distribution, and nothing retried it. Now curl retries the way core's beads
# download does, and only a 404 is the distribution not being covered.
#
# The URL stays in the fragment, built from /etc/os-release, so that
# scripts/no-ubuntu-only-sources.test.sh, which reads the fragments, still sees
# the source.
set -uo pipefail

[ "$#" -eq 3 ] || { echo "usage: feed-config.sh <url> <out> <distribution>" >&2; exit 2; }
url="$1"; out="$2"; distro="$3"

err="$(mktemp)"
trap 'rm -f "$err"' EXIT
code="$(curl -fsSL --retry 5 --retry-all-errors --retry-delay 5 --connect-timeout 15 \
    -o "$out" -w '%{http_code}' "$url" 2>"$err")"
rc=$?
[ "$rc" -eq 0 ] && exit 0

rm -f "$out"
said="$(tail -n 1 "$err")"
if [ "$code" = 404 ]; then
    echo "dotnet stack: Microsoft publishes no apt config for $distro at $url." >&2
    echo "  The .NET SDK feed is per-distribution; this base is not one it covers." >&2
elif [ "$code" = 000 ] || [ -z "$code" ]; then
    echo "dotnet stack: packages.microsoft.com refused or failed: it could not be reached for $url after retrying (curl exit $rc: $said)." >&2
    echo "  This is the network or the feed, not the distribution; build again later, or check the host's connection." >&2
else
    echo "dotnet stack: packages.microsoft.com refused or failed with HTTP $code for $url after retrying (curl exit $rc: $said)." >&2
    echo "  This is the feed, not the distribution: a 429 is its rate limit and a 5xx its own failure; build again later." >&2
fi
exit 1
