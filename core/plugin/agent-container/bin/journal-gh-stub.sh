# shellcheck shell=bash
# Sourced by the journal's tests: writes a gh that stands in for GitHub at $1,
# answering the calls journal-flush and journal-read make, in the shapes the
# real API answered on 2026-10-29. $GH_STORE holds the repository's files, so
# what a PUT sends is what a GraphQL read finds; $GH_CALLS logs every call.
# $GH_PRIVATE is the repository's visibility, or "missing" for a 404, and
# $GH_FAIL names the one step that fails: visibility, get, put or graphql,
# or offline for every call.
journal_gh_stub() {
    cat > "$1" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_CALLS"
[ "${GH_FAIL:-}" = offline ] && { echo "error connecting to api.github.com" >&2; exit 1; }
[ "$1" = api ] || { echo "gh stub: unexpected $*" >&2; exit 2; }
shift
if [ "$1" = graphql ]; then
    [ "${GH_FAIL:-}" = graphql ] && { echo "error connecting to api.github.com" >&2; exit 1; }
    [ "${GH_PRIVATE:-true}" = missing ] && { echo "gh: Could not resolve to a Repository with the name 'x'." >&2; exit 1; }
    expr=""
    for a in "$@"; do case "$a" in e=*) expr="${a#e=}" ;; esac; done
    dir="$GH_STORE/${expr#HEAD:}"
    if [ -d "$dir" ] && [ -n "$(ls "$dir")" ]; then
        for f in "$dir"/*; do jq -n --arg n "$(basename "$f")" --rawfile t "$f" '{name: $n, object: {text: $t}}'; done \
            | jq -sc '{data: {repository: {object: {entries: .}}}}'
    else
        echo '{"data":{"repository":{"object":null}}}'
    fi
    exit 0
fi
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
            *) echo "${GH_PRIVATE:-true}" ;;
        esac ;;
esac
SH
    chmod +x "$1"
}
