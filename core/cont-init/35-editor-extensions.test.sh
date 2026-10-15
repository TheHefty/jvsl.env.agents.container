#!/usr/bin/env bash
# Drives the real 35-editor-extensions.sh against trees this test builds.
#
# Debt a-stack-added-later-never-brings-its-extension: Dev Containers installs
# the image's extensions once and writes .installExtensionsMarker, which lives
# on the persistent volume and makes every later container skip them. chip8
# selected cpp after its first container, and clangd never arrived.
#
# Its three worst failures, each a case below:
#   1. it never fires: a changed list leaves the marker, so nothing installs;
#   2. it fires on every boot: an unchanged list removes the marker anyway, and
#      every attach tries to install everything again;
#   3. it writes as root: the recorded list lands in the editor's own state
#      directory owned by someone else (the class 10-state-ownership repairs).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$HERE/35-editor-extensions.sh"

pass=0
fail=0
assert() {
    if [ "$2" = "$3" ]; then echo "ok      $1"; pass=$((pass + 1)); else
        echo "NOT OK  $1" >&2; echo "        expected: $3" >&2; echo "        got:      $2" >&2; fail=$((fail + 1)); fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
# Records who a write runs as, then runs it.
cat > "$work/bin/s6-setuidgid" <<'SH'
#!/usr/bin/env bash
echo "as $1: ${*:2}" >> "$CALLS"
shift
exec "$@"
SH
chmod +x "$work/bin/s6-setuidgid"
export CALLS="$work/calls"

metadata() {
    # $@: extension identifiers, spread over two entries as the composer does.
    local first="${1:-}"; shift || true
    local rest; rest="$(printf '"%s",' "$@")"; rest="[${rest%,}]"
    printf '[{"remoteUser":"abc","customizations":{"vscode":{"extensions":["%s"]}}},{"customizations":{"vscode":{"extensions":%s}}}]\n' \
        "$first" "$rest" > "$work/metadata.json"
}

machine="$work/Machine"
boot() {
    : > "$CALLS"
    EXTENSIONS_METADATA="$work/metadata.json" EDITOR_MACHINE_DIR="$machine" PATH="$work/bin:$PATH" \
        bash "$HOOK" > "$work/out" 2>&1
    echo $? > "$work/rc"
}
marker() { [ -e "$machine/.installExtensionsMarker" ] && echo present || echo absent; }

# --- a first boot: nothing recorded, no marker yet ------------------------------

rm -rf "$machine"
metadata file-icons.file-icons cweijan.vscode-database-client2
boot
assert "a first boot succeeds" "$(cat "$work/rc")" "0"
assert "and records the image's list" "$(cat "$machine/.jvsl-extensions" 2>/dev/null)" \
    "$(printf '%s\n' cweijan.vscode-database-client2 file-icons.file-icons)"
assert "writing it as abc, never as root" "$(grep -c '^as abc:' "$CALLS")" "$(grep -c . "$CALLS")"

# --- 2. an unchanged list leaves the marker alone -------------------------------

touch "$machine/.installExtensionsMarker"
boot
assert "an unchanged list leaves the marker" "$(marker)" "present"
assert "and says nothing" "$(cat "$work/out")" ""

# --- 1. a changed list removes the marker ---------------------------------------
#
# chip8: cpp selected after the first container, clangd added to the image.

metadata file-icons.file-icons cweijan.vscode-database-client2 llvm-vs-code-extensions.vscode-clangd
boot
assert "a stack's extension added later removes the marker" "$(marker)" "absent"
assert "and records the new list" "$(grep -c vscode-clangd "$machine/.jvsl-extensions" 2>/dev/null)" "1"
assert "and says which extensions changed" "$(grep -c 'llvm-vs-code-extensions.vscode-clangd' "$work/out")" "1"
assert "the removal ran as abc too" "$(grep -c '^as abc:' "$CALLS")" "$(grep -c . "$CALLS")"

touch "$machine/.installExtensionsMarker"
boot
assert "the next boot, with the same list, leaves the new marker" "$(marker)" "present"

# The order the entries list them in is not a change.
metadata cweijan.vscode-database-client2 llvm-vs-code-extensions.vscode-clangd file-icons.file-icons
boot
assert "the same extensions in another order are not a change" "$(marker)" "present"

# --- the image without the file: said once, nothing touched --------------------

rm -f "$work/metadata.json"
boot
assert "an image without the metadata file still boots" "$(cat "$work/rc")" "0"
assert "and says why it did nothing, naming the file" "$(grep -cF "$work/metadata.json" "$work/out")" "1"
assert "leaving the marker alone" "$(marker)" "present"

echo
echo "35-editor-extensions.test: $pass passed, $fail failed."
[ "$fail" -eq 0 ]
