#!/usr/bin/env bash
# Every download an image fragment makes retries (debt izb, task
# every-fetch-in-the-image-retries).
#
# A fetch from github.com without a retry fails the whole build on one 429, one
# 5xx or one dropped connection, where the same fetch with
# `--retry 5 --retry-all-errors` recovers. Three did that until 2026-11-25 —
# CPython in the python stack, ai-jail and ai-memory in core — while every
# other fetch retried; nothing required it, which is how the three were
# missed, and how the debt named only one of them.
#
# Read the way no-fetch-runs-unverified reads them: comments dropped,
# continued lines joined, then each logical line cut into commands at &&, ||,
# ;, | and $( — so a curl is found at the start of a command wherever it sits,
# and the package `curl` in an apt-get list or `php-curl` is not a fetch. A
# command that runs curl has to carry --retry.
#
# The ways this guard itself fails, checked first against fixtures so it is
# seen to catch them before it is trusted on the tree:
#   1. it misses a fetch — continued over lines, after a pipe, inside $( );
#   2. it refuses what is not a fetch — a package name, a comment — and gets
#      loosened until it checks nothing;
#   3. it reads no fragment at all and passes.
#
# FETCH_GUARD_ROOT points it at another tree.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${FETCH_GUARD_ROOT:-$(cd "$HERE/.." && pwd)}"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok      $1"; else
        echo "FAIL    $1"; echo "        expected: $3"; echo "        got:      $2"; failures=$((failures + 1)); fi
}

# The curl commands in a fragment with no --retry, one per line.
unretried() {
    grep -vE '^[[:space:]]*#' "$1" | sed -e ':a' -e '/\\$/N; s/\\\n//; ta' \
        | sed -E 's/&&|\|\||;|\||\$\(/\n/g' \
        | sed -E 's/^[[:space:]]*(RUN[[:space:]]+)?//' \
        | grep -E '^curl([[:space:]]|$)' \
        | grep -v -- '--retry' || true
}
count() { if [ -z "$1" ]; then echo 0; else printf '%s\n' "$1" | wc -l | tr -d ' '; fi; }

fixtures="$(mktemp -d)"
trap 'rm -rf "$fixtures"' EXIT
fx() { printf '%s\n' "$2" > "$fixtures/$1"; count "$(unretried "$fixtures/$1")"; }

# 1: what has to be caught.
check "1: a RUN curl with no retry is caught" "$(fx a 'RUN curl -fsSL https://x/y -o /tmp/y')" "1"
check "1: one continued over lines, its flags on the next" "$(fx b $'RUN set -e \\\n    && curl -fsSL \\\n         https://x/y -o /tmp/y \\\n    && tar -xf /tmp/y')" "1"
check "1: one after a pipe" "$(fx c 'RUN printf x | curl -fsSL -d @- https://x/y')" "1"
check "1: one inside \$( )" "$(fx d 'RUN v="$(curl -fsSL https://x/v)" && echo "$v"')" "1"
check "1: only the one without, when two share a line" \
    "$(fx e 'RUN curl --retry 5 -fsSL https://x/a -o a && curl -fsSL https://x/b -o b')" "1"
# 2: what is not a fetch.
check "2: the package curl in an apt-get list is not a fetch" "$(fx f $'RUN apt-get install -y \\\n    ca-certificates \\\n    curl \\\n    git')" "0"
check "2: nor php-curl" "$(fx g $'RUN apt-get install -y \\\n    php8.3-curl \\\n    php8.3-cli')" "0"
check "2: nor a curl in a comment" "$(fx h $'# RUN curl -fsSL https://x/y\nRUN true')" "0"
check "2: a fetch with --retry passes, the flag on its own line" "$(fx i $'RUN curl -fL \\\n    --retry 5 --retry-all-errors \\\n    https://x/y -o y')" "0"

# 3: the tree.
mapfile -t frags < <(find "$ROOT/core" "$ROOT/stacks" -name 'Dockerfile.frag' 2>/dev/null | sort)
check "3: the fragments are there, so this cannot pass on none" "$([ "${#frags[@]}" -ge 5 ] && echo yes || echo "${#frags[@]} under $ROOT")" "yes"
fetches=0
bad=""
for f in "${frags[@]}"; do
    n="$(grep -vE '^[[:space:]]*#' "$f" | sed -e ':a' -e '/\\$/N; s/\\\n//; ta' | sed -E 's/&&|\|\||;|\||\$\(/\n/g' \
        | sed -E 's/^[[:space:]]*(RUN[[:space:]]+)?//' | grep -cE '^curl([[:space:]]|$)' || true)"
    fetches=$((fetches + n))
    while IFS= read -r line; do
        [ -n "$line" ] && bad+="${f#"$ROOT"/}: ${line:0:120}"$'\n'
    done <<<"$(unretried "$f")"
done
check "3: fetches are found in the tree, so the reading works on it" "$([ "$fetches" -ge 8 ] && echo yes || echo "$fetches")" "yes"
check "every fetch in core/ and stacks/ retries" "${bad%$'\n'}" ""
if [ -n "$bad" ]; then
    echo "        Add --retry 5 --retry-all-errors --retry-delay 5 --connect-timeout 15, as the golang and ruby" \
         "stacks do; keep -S, or --no-progress-meter, so curl's own error still names the status."
fi

if [ "$failures" -gt 0 ]; then
    echo "every-fetch-retries.test: $failures failure(s)"
    exit 1
fi
echo "every-fetch-retries.test: every download in core/ and stacks/ retries, and this guard catches one that does not."
