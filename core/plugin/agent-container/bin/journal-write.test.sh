#!/usr/bin/env bash
# Exercises journal-write and journal-flush, the real scripts, with gh and bd
# standing in (story the-retro-writes-the-entry-to-the-developers-private-repository).
#
# The journal is the developer's: it goes to a private repository of theirs,
# never to the project's tracker, which travels with a public repository. The
# failures this guards: an entry lost, neither sent nor kept; an entry sent
# where it must not go — a public repository, the tracker; and a day with two
# entries, or the wrong one overwritten.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=core/plugin/agent-container/bin/journal-body-fixture.sh
. "$HERE/journal-body-fixture.sh"

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
export GH_CALLS="$work/gh-calls" GH_STORE="$work/store" BD_CALLS="$work/bd-calls"

# gh standing in for GitHub. $GH_PRIVATE is the repository's visibility, or
# "missing" for a 404; $GH_FAIL names the one step that fails (visibility, get,
# put); files live under $GH_STORE, so a test can read what was sent.
cat > "$work/bin/gh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_CALLS"
[ "$1" = api ] || { echo "gh stub: unexpected $*" >&2; exit 2; }
shift
method=GET
if [ "$1" = -X ]; then method="$2"; shift 2; fi
path="$1"; shift
case "$path" in
    repos/*/*/contents/*)
        file="${path#repos/*/*/contents/}"
        if [ "$method" = GET ]; then
            [ "${GH_FAIL:-}" = get ] && { echo "HTTP 502: Bad Gateway" >&2; exit 1; }
            [ -f "$GH_STORE/$file" ] || { echo "gh: Not Found (HTTP 404)" >&2; exit 1; }
            sha1sum "$GH_STORE/$file" | cut -c1-40; exit 0
        fi
        [ "${GH_FAIL:-}" = put ] && { echo "HTTP 409: conflict" >&2; exit 1; }
        content=""; sha=""
        for a in "$@"; do
            case "$a" in content=*) content="${a#content=}" ;; sha=*) sha="${a#sha=}" ;; esac
        done
        if [ -f "$GH_STORE/$file" ] && [ "$sha" != "$(sha1sum "$GH_STORE/$file" | cut -c1-40)" ]; then
            echo "HTTP 409: sha does not match" >&2; exit 1
        fi
        mkdir -p "$(dirname "$GH_STORE/$file")"
        printf '%s' "$content" | base64 -d > "$GH_STORE/$file"
        echo '{"content":{"path":"'"$file"'"}}' ;;
    repos/*/*)
        [ "${GH_FAIL:-}" = visibility ] && { echo "error connecting to api.github.com" >&2; exit 1; }
        case "${GH_PRIVATE:-true}" in
            missing) echo "gh: Not Found (HTTP 404)" >&2; exit 1 ;;
            *) echo "$GH_PRIVATE" ;;
        esac ;;
esac
SH
cat > "$work/bin/bd" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$BD_CALLS"
SH
chmod +x "$work/bin/gh" "$work/bin/bd"

home="$work/home"
outbox="$home/journal-outbox/demo"
configure() { mkdir -p "$home"; printf '%s' "$1" > "$home/journal.json"; }
reset() { rm -rf "$home" "$GH_STORE" "$GH_CALLS" "$BD_CALLS"; mkdir -p "$home" "$GH_STORE"; : > "$GH_CALLS"; : > "$BD_CALLS"; unset GH_FAIL; export GH_PRIVATE=true; }
write() {
    local code=0
    PATH="$work/bin:$PATH" REVIEW_GH="$work/bin/gh" JOURNAL_HOME="$home" JOURNAL_PROJECT=demo \
        JOURNAL_TODAY="${DAY:-2026-10-29}" bash "$HERE/journal-write" "$work/body.md" > "$work/out" 2>&1 || code=$?
    echo "$code"
}
said() { tail -n 1 "$work/out"; }
puts() { grep -c '^api -X PUT' "$GH_CALLS" || true; }

body > "$work/body.md"

# --- sent to the private repository, never to the tracker ---------------------
reset; configure '{"repository": "TheHefty/journal"}'
check "an entry is sent" "$(write)" "0"
check "to <project>/<day>.md in the private repository, as written" "$(cmp -s "$GH_STORE/demo/2026-10-29.md" "$work/body.md" && echo same || echo differs)" "same"
check "saying where it went" "$(said)" "sent: TheHefty/journal:demo/2026-10-29.md"
check "and no longer waiting in the outbox" "$(ls "$outbox" 2>/dev/null | wc -l | tr -d ' ')" "0"
check "the tracker is never written" "$(wc -l < "$BD_CALLS" | tr -d ' ')" "0"

# --- one entry per day ---------------------------------------------------------
body "a second, truer line" > "$work/body.md"
check "a second retro the same day" "$(write)" "0"
check "updates the same file, passing the sha it read" "$(grep -c '^api -X PUT repos/TheHefty/journal/contents/demo/2026-10-29.md .*sha=' "$GH_CALLS")" "1"
check "and the file holds the second body" "$(grep -c 'a second, truer line' "$GH_STORE/demo/2026-10-29.md")" "1"
DAY=2026-10-30 write > /dev/null
check "a new day is a new file" "$(ls "$GH_STORE/demo" | paste -sd' ' -)" "2026-10-29.md 2026-10-30.md"

reset; configure '{"repository": "TheHefty/journal"}'
code=0; PATH="$work/bin:$PATH" REVIEW_GH="$work/bin/gh" JOURNAL_HOME="$home" JOURNAL_PROJECT=demo TZ=America/Sao_Paulo JOURNAL_NOW=1793149200 \
    bash "$HERE/journal-write" "$work/body.md" > "$work/out" 2>&1 || code=$?
check "a retro at 22:00 in São Paulo is that day's, not tomorrow's in UTC" "$code $(ls "$GH_STORE/demo")" "0 2026-10-27.md"

# --- never lost: kept in the outbox until GitHub confirms ------------------------
for step in visibility get put; do
    reset; configure '{"repository": "TheHefty/journal"}'; export GH_FAIL=$step
    check "when the $step step fails, the entry waits in the outbox" "$(write) $(ls "$outbox" 2>/dev/null)" "0 2026-10-29.md"
    check "and the retro is told it is waiting, and why" "$(said | grep -c '^waiting in the outbox: ')" "1"
done

reset
check "with no repository named, the entry waits" "$(write) $(ls "$outbox" 2>/dev/null)" "0 2026-10-29.md"
check "and the retro is told how to name one" "$(said | grep -c 'journal.json')" "1"
check "nothing is asked of GitHub" "$(wc -l < "$GH_CALLS" | tr -d ' ')" "0"

reset; configure '{"repository": "not a repository"}'
check "a journal.json that does not name owner/repo sends nothing" "$(write) $(ls "$outbox") $(wc -l < "$GH_CALLS" | tr -d ' ')" "0 2026-10-29.md 0"

reset; configure '{"repository": "TheHefty/journal"}'; export GH_PRIVATE=missing
check "a repository that does not exist keeps the entry waiting" "$(write) $(ls "$outbox") $(said | grep -c 'TheHefty/journal')" "0 2026-10-29.md 1"

# --- never public -----------------------------------------------------------------
reset; configure '{"repository": "TheHefty/jvsl.env.agents.container"}'; export GH_PRIVATE=false
check "a public repository is refused as the journal" "$(write) $(puts)" "0 0"
check "the entry waits in the outbox" "$(ls "$outbox")" "2026-10-29.md"
check "saying the journal's repository must be private" "$(said | grep -c 'must be private')" "1"

# --- the outbox is sent whole, each entry to its own path --------------------------
reset; configure '{"repository": "TheHefty/journal"}'; export GH_FAIL=put
DAY=2026-10-27 write > /dev/null; DAY=2026-10-28 write > /dev/null
unset GH_FAIL
check "two entries were waiting" "$(ls "$outbox" | paste -sd' ' -)" "2026-10-27.md 2026-10-28.md"
code=0; PATH="$work/bin:$PATH" REVIEW_GH="$work/bin/gh" JOURNAL_HOME="$home" bash "$HERE/journal-flush" > "$work/out" 2>&1 || code=$?
check "one flush sends both" "$code $(ls "$GH_STORE/demo" | paste -sd' ' -)" "0 2026-10-27.md 2026-10-28.md"
check "and empties the outbox" "$(ls "$outbox" 2>/dev/null | wc -l | tr -d ' ')" "0"

# --- what only the developer gives is still required --------------------------------
reset; configure '{"repository": "TheHefty/journal"}'
body "" > "$work/body.md"
check "an empty What I learned is refused" "$(write)" "1"
check "and nothing is kept or sent" "$(ls "$outbox" 2>/dev/null | wc -l | tr -d ' ') $(wc -l < "$GH_CALLS" | tr -d ' ')" "0 0"
check "saying the line is the developer's" "$(grep -c "developer's own" "$work/out")" "1"
body "x" "" > "$work/body.md"
check "an empty Decided alone is refused, and says Nothing. is the answer" "$(write) $(grep -c 'Nothing\.' "$work/out")" "1 1"
body | sed '/^## Went wrong$/,/^## Decided alone$/{/^## Decided alone$/!d}' > "$work/body.md"
check "a missing section is refused, naming it" "$(write) $(grep -c 'Went wrong' "$work/out")" "1 1"

if [ "$failures" -gt 0 ]; then
    echo "journal-write.test: $failures failure(s)"
    exit 1
fi
echo "journal-write.test: the entry goes to the developer's private repository or waits in the outbox; never lost, never public, never in the tracker, one per day."
