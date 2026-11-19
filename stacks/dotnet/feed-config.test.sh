#!/usr/bin/env bash
# Exercises stacks/dotnet/feed-config.sh, the real script, with curl stubbed.
#
# Debt the-dotnet-stack-reports-any-feed-failure-as-an-unsupported-
# distribution (z1k), task z1k.1. On 2026-11-18 CI run 44342536225 got a 429
# from packages.microsoft.com and the build said "Microsoft publishes no apt
# config for ubuntu 24.04 ... this base is not one it covers": a rate limit
# reported as an unsupported distribution, with no retry. The rerun passed.
# Here: a 404 is still the distribution not covered; a 429, a 5xx or a
# connection failure is the feed refusing or failing, named, after retries.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/feed-config.sh"

failures=0
check() {
    if [ "$2" = "$3" ]; then
        echo "ok   $1"
    else
        echo "FAIL $1"
        echo "     expected: $3"
        echo "     got:      $2"
        failures=$((failures + 1))
    fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"

# curl, stood in: records its arguments, writes a body to -o's file when the
# status is 200, prints the status where -w asks for it, and exits the way
# curl -f does: $CURL_RC, with $CURL_ERR on stderr.
cat > "$work/bin/curl" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CURL_LOG"
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
[ "$CURL_CODE" = 200 ] && [ -n "$out" ] && echo "a deb" > "$out"
printf '%s' "$CURL_CODE"
[ -n "${CURL_ERR:-}" ] && echo "$CURL_ERR" >&2
exit "${CURL_RC:-0}"
SH
chmod +x "$work/bin/curl"

URL="https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb"
run() { # run <http code> <curl rc> [curl stderr] -> echoes the exit code; output in $work/out
    : > "$work/curl-log"; rm -f "$work/out.deb"
    CURL_LOG="$work/curl-log" CURL_CODE="$1" CURL_RC="$2" CURL_ERR="${3:-}" PATH="$work/bin:$PATH" \
        bash "$SCRIPT" "$URL" "$work/out.deb" "ubuntu 24.04" > "$work/out" 2>&1
    echo "$?"
}
said() { grep -ciF -- "$1" "$work/out" || true; }

# --- the feed answers -----------------------------------------------------------
check "a 200 succeeds" "$(run 200 0)" "0"
check "  with the config where it was asked for" "$(cat "$work/out.deb" 2>/dev/null)" "a deb"
check "  fetching the URL it was given" "$(grep -cF -- "$URL" "$work/curl-log")" "1"
check "  retrying the way core's beads download does" \
    "$(grep -F -- '--retry 5' "$work/curl-log" | grep -F -- '--retry-all-errors' | grep -F -- '--retry-delay 5' | grep -cF -- '--connect-timeout 15')" "1"
check "  and reading the HTTP status" "$(grep -cF -- '%{http_code}' "$work/curl-log")" "1"

# --- a 404: the distribution is not covered, as before ---------------------------
check "a 404 fails" "$(run 404 22 'curl: (22) The requested URL returned error: 404')" "1"
check "  saying Microsoft publishes no config for this distribution" "$(said 'publishes no apt config for ubuntu 24.04')" "1"
check "  and that the base is not one it covers" "$(said 'not one it covers')" "1"

# --- the feed refuses or fails: never "unsupported" -------------------------------
for c in "429 the feed refused" "503 the feed failed" "500 the feed failed"; do
    code="${c%% *}"
    check "a $code fails" "$(run "$code" 22 "curl: (22) The requested URL returned error: $code")" "1"
    check "  naming the status" "$(said "HTTP $code")" "1"
    check "  saying the feed refused or failed" "$(said 'refused or failed')" "1"
    check "  and never that the distribution is unsupported" "$(said 'publishes no apt config') $(said 'not one it covers')" "0 0"
    check "  saying it was retried" "$(said 'after retrying')" "1"
done

check "a connection failure fails" "$(run 000 6 'curl: (6) Could not resolve host: packages.microsoft.com')" "1"
check "  quoting curl's error" "$(said 'Could not resolve host')" "1"
check "  saying the feed could not be reached" "$(said 'refused or failed')" "1"
check "  and never that the distribution is unsupported" "$(said 'publishes no apt config') $(said 'not one it covers')" "0 0"
check "nothing half-written is left where the config was asked for" "$([ -e "$work/out.deb" ] && echo left || echo none)" "none"

check "no arguments is a usage error" "$(PATH="$work/bin:$PATH" bash "$SCRIPT" >/dev/null 2>&1; echo $?)" "2"

if [ "$failures" -gt 0 ]; then
    echo "feed-config.test: $failures failure(s)"
    exit 1
fi
echo "feed-config.test: a 404 says the distribution is not covered; a 429, a 5xx or a connection failure says the feed refused or failed, after retries."
