#!/usr/bin/env bash
# Exercises report-check, the real script, against a throwaway repository
# (story the-project-report). A claim cites a file that exists or says it is an
# inference; an implicit decision is given no motive; a topic names its files.
# A script cannot check that a file says what the report claims — the citation
# is what lets the developer check that.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=core/plugin/agent-container/bin/report-fixture.sh
. "$HERE/report-fixture.sh"

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
repo "$work/r"; mkdir -p "$work/r/docs"
f="$work/r/docs/REPORT.md"
run() { local code=0; (cd "$work/r" && bash "$HERE/report-check" docs/REPORT.md) > "$work/out" 2>&1 || code=$?; echo "$code"; }
broken() { report | sed "$1" > "$f"; }
line_of() { grep -c "^REPORT.md:[0-9]*: .*$1" "$work/out"; }

report > "$f"
check "a well-formed report passes" "$(run)" "0"
check "in silence" "$(wc -c < "$work/out" | tr -d ' ')" "0"

broken '/^## Study list$/,/^- How the port/d'
check "a missing section is named" "$(run) $(line_of 'Study list')" "1 1"
broken 's/^## Overview$/## TMP/; s/^## Critical areas$/## Overview/; s/^## TMP$/## Critical areas/'
check "sections out of order are named" "$(run) $(line_of 'order')" "1 1"
broken 's/^- A web service on port 8080, in `src\/app.js`\./- A web service on port 8080./'
check "an overview claim with no file and no (inference) is named" "$(run) $(line_of 'cites no file')" "1 1"
broken '/^- A web service/s/`src\/app.js`/`src\/server.js`/'
check "a cited file that does not exist is named" "$(run) $(line_of 'src/server.js')" "1 1"
broken 's/ — Cost of change: low\./ — Cost of change: low. — Reason: speed./'
check "an implicit decision given a reason is named" "$(run) $(line_of 'implicit.*Reason')" "1 1"
broken 's/ — Source: `docs\/adr\/001.md`//'
check "a documented decision with no source is named" "$(run) $(line_of 'Source')" "1 1"
broken 's/ — Files: `src\/app.js`, `README.md`//'
check "a topic with no files is named" "$(run) $(line_of 'Files')" "1 1"
broken 's/`src\/app.js:1`/`src\/app.js:1`/'
check "a path with a line number counts as the file" "$(run)" "0"

check "a report that is not there is an error" "$( (cd "$work/r" && bash "$HERE/report-check" docs/NOPE.md) > /dev/null 2>&1; echo $?)" "2"

if [ "$failures" -gt 0 ]; then
    echo "report-check.test: $failures failure(s)"
    exit 1
fi
echo "report-check.test: every claim cites a file that exists or says it is an inference, and no implicit decision is given a motive."
