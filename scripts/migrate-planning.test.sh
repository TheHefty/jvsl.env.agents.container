#!/usr/bin/env bash
# Exercises the migration against a fake tracker and a throwaway tree.
#
# **The first failure scenario is what this is for**: an item created empty or
# truncated while the file is deleted anyway, both halves reporting success.
# So the fake `bd` can be told to truncate, and the test asserts that nothing is
# deleted when it does.
#
# The comparison the migration makes is exact after one named transformation —
# the file's content with trailing newlines removed. Measured against the real
# binary: it returns 11,568 bytes for an 11,569-byte file and changes nothing
# else. See the task design.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/migrate-planning.sh"

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

# A fake tracker: `create` records the body under an id and prints JSON, `show`
# returns it with the trailing newline stripped — which is what the real one
# does. BD_FAKE_TRUNCATE makes it keep one byte less, standing in for every way
# a body can arrive incomplete.
cat > "$work/bin/bd" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
store="${BD_FAKE_STORE:?}"
mkdir -p "$store"
case "${1:-}" in
  create)
    shift
    title=""; desc=""; parent=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --description) desc="$2"; shift 2 ;;
        --parent) parent="$2"; shift 2 ;;
        --type|--acceptance) shift 2 ;;
        --json) shift ;;
        *) title="$1"; shift ;;
      esac
    done
    n=$(( $(ls "$store" 2>/dev/null | wc -l) + 1 ))
    id="${parent:+$parent.}x$n"
    printf '%s' "${desc%$'\n'}" > "$store/$id.body"
    [ -n "${BD_FAKE_TRUNCATE:-}" ] && printf '%s' "${desc:0:${#desc}-2}" > "$store/$id.body"
    printf '{"id":"%s","title":"%s"}\n' "$id" "$title"
    ;;
  show)
    id="$2"
    printf '{"id":"%s","description":%s}\n' "$id" \
      "$(python3 -c 'import json,sys;print(json.dumps(open(sys.argv[1]).read()))' "$store/$id.body")"
    ;;
  *) exit 0 ;;
esac
SH
chmod +x "$work/bin/bd"
export PATH="$work/bin:$PATH"

make_tree() {
    rm -rf "$work/tree"; mkdir -p "$work/tree/an-epic/a-story/tasks"
    printf '# Epic\n\nthe epic body\n' > "$work/tree/an-epic/README.md"
    printf '# Story\n\nthe story body\n' > "$work/tree/an-epic/a-story/OVERVIEW.md"
    printf 'Feature: x\n' > "$work/tree/an-epic/a-story/a-story.feature"
    printf '# Task\n\nthe task body\n' > "$work/tree/an-epic/a-story/tasks/a-task.md"
}

run() {
    rm -rf "$work/store"
    BD_FAKE_STORE="$work/store" MIGRATE_ROOT="$work/tree" bash "$SCRIPT" >"$work/out" 2>&1
    echo "$?"
}

# --- the happy path --------------------------------------------------------

make_tree
check "a clean tree migrates" "$(run)" "0"
check "and the documents are gone" \
    "$(find "$work/tree" -name '*.md' -o -name '*.feature' | wc -l)" "0"
check "one item per document" "$(ls "$work/store" | wc -l)" "3"

# --- the first failure scenario --------------------------------------------

make_tree
export BD_FAKE_TRUNCATE=1
check "a truncated body fails the migration" "$([ "$(run)" = "0" ] && echo no || echo yes)" "yes"
check "and nothing is deleted when it does" \
    "$([ -f "$work/tree/an-epic/a-story/OVERVIEW.md" ] && echo kept || echo gone)" "kept"
unset BD_FAKE_TRUNCATE

echo
if [ "$failures" -eq 0 ]; then
    echo "migrate-planning.test: all checks passed."
else
    echo "migrate-planning.test: $failures failed." >&2
    exit 1
fi
