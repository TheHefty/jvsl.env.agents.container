#!/usr/bin/env bash
# Drives the real 36-editor-settings.sh against trees this test builds.
#
# Debt rjj (devcontainer.json customizations do not reach an existing editor's
# settings): Dev Containers writes the editor's Machine settings once, on the
# persistent volume, so the settings a stack brought later never arrived.
# Measured in kotodori on 2026-10-29: java.jdt.ls.vmargs and
# java.server.launchMode were in the image's metadata and absent from Machine
# settings, so the Java language server ran with -Xmx2G and a syntax server;
# put there by hand, both were honoured at once.
#
# Its three worst failures, each a case below:
#   1. it overwrites the developer's own value in Remote Settings on every boot;
#   2. it corrupts or empties a settings.json it cannot read (comments, trailing
#      commas, half-written), and the editor loses every setting;
#   3. it never delivers a stack's later change, reading its own earlier value
#      as the developer's.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$HERE/36-editor-settings.sh"

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

# $1: the Java stack's vmargs; core's entry carries a setting of its own, and
# the later entry wins, as the composer orders them.
metadata() {
    jq -n --arg vm "$1" '[
        {remoteUser: "abc", customizations: {vscode: {settings: {"files.trimTrailingWhitespace": true, "java.jdt.ls.vmargs": "-Xmx9g"}}}},
        {customizations: {vscode: {extensions: ["vscjava.vscode-java-pack"], settings: {
            "java.jdt.ls.vmargs": $vm,
            "java.server.launchMode": "Standard",
            "java.configuration.runtimes": [{name: "JavaSE-21", path: "/usr/lib/jvm/stack-java", default: true}]}}}}
    ]' > "$work/metadata.json"
}

machine="$work/Machine"
settings="$machine/settings.json"
boot() {
    : > "$CALLS"
    EDITOR_METADATA="$work/metadata.json" EDITOR_MACHINE_DIR="$machine" PATH="$work/bin:$PATH" \
        bash "$HOOK" > "$work/out" 2>&1
    echo $? > "$work/rc"
}
key() { jq -c --arg k "$1" '.[$k]' "$settings" 2>/dev/null; }

# --- a first boot: no settings.json yet -------------------------------------------

rm -rf "$machine"
metadata "-Xmx1536m"
boot
assert "a first boot succeeds" "$(cat "$work/rc")" "0"
assert "and writes the image's settings, the later entry winning" "$(key java.jdt.ls.vmargs)" '"-Xmx1536m"'
assert "every one of them, arrays included" "$(key java.configuration.runtimes | jq -r '.[0].path')" "/usr/lib/jvm/stack-java"
assert "core's own setting too" "$(key files.trimTrailingWhitespace)" "true"
assert "writing as abc, never as root" "$(grep -c '^as abc:' "$CALLS")" "$(grep -c . "$CALLS")"
assert "and says what it wrote" "$(grep -c '^\[36-editor-settings\] wrote java.jdt.ls.vmargs' "$work/out")" "1"

boot
assert "a boot that changes nothing writes nothing" "$(cat "$work/out")" ""

# --- kotodori's case: the settings existed, without the stack's keys ----------------

rm -rf "$machine"; mkdir -p "$machine"
printf '%s\n' '{"java.import.gradle.version": "8.14.3", "editor.fontSize": 15}' > "$settings"
boot
assert "an existing settings.json gains the keys it lacked" "$(key java.server.launchMode)" '"Standard"'
assert "and keeps every key that was there" "$(key java.import.gradle.version) $(key editor.fontSize)" '"8.14.3" 15'

# --- 1. the developer's own value is kept ---------------------------------------------

jq '."java.jdt.ls.vmargs" = "-Xmx4g"' "$settings" > "$work/s" && cp "$work/s" "$settings"
boot
assert "a value the developer changed is kept" "$(key java.jdt.ls.vmargs)" '"-Xmx4g"'
assert "and said, with how to take the image's value" \
    "$(grep -c '^\[36-editor-settings\] kept java.jdt.ls.vmargs: .*Remote Settings' "$work/out")" "1"
metadata "-Xmx2g"
boot
assert "still kept when the image changes its own value" "$(key java.jdt.ls.vmargs)" '"-Xmx4g"'

# --- 3. a stack's later change arrives ---------------------------------------------------

rm -rf "$machine"
metadata "-Xmx1536m"
boot
metadata "-Xmx1g"
boot
assert "a value the hook wrote takes the image's new one" "$(key java.jdt.ls.vmargs)" '"-Xmx1g"'
assert "saying so" "$(grep -c '^\[36-editor-settings\] wrote java.jdt.ls.vmargs' "$work/out")" "1"

# Put there by hand before the hook existed, equal to the image's: recorded, silent,
# and so a later change of the image's still arrives.
rm -rf "$machine"; mkdir -p "$machine"
metadata "-Xmx1536m"
jq -n '{"java.jdt.ls.vmargs": "-Xmx1536m"}' > "$settings"
boot
assert "a value already equal to the image's is recorded without a word about it" \
    "$(grep -c 'java.jdt.ls.vmargs' "$work/out" || true)" "0"
metadata "-Xmx1g"
boot
assert "and takes the image's next value" "$(key java.jdt.ls.vmargs)" '"-Xmx1g"'

# --- 2. a settings.json it cannot read is never touched ------------------------------------

rm -rf "$machine"; mkdir -p "$machine"
printf '%s\n' '{' '  // my font' '  "editor.fontSize": 15,' '}' > "$settings"
cp "$settings" "$work/before"
boot
assert "a settings.json with comments still lets the boot go on" "$(cat "$work/rc")" "0"
assert "and is left byte for byte" "$(cmp -s "$settings" "$work/before" && echo same || echo changed)" "same"
assert "saying why, naming the file" "$(grep -cF "$settings" "$work/out")" "1"

printf '%s' '{"editor.fontSize": 1' > "$settings"; cp "$settings" "$work/before"
boot
assert "a half-written one is left as it is too" "$(cmp -s "$settings" "$work/before" && echo same || echo changed)" "same"

# The write goes through a file beside it and a move: nothing else is left behind.
rm -rf "$machine"
boot
assert "no temporary file is left beside the settings" "$(find "$machine" -name '*.tmp*' | wc -l | tr -d ' ')" "0"

# --- the image without the file: said once, nothing touched --------------------------

rm -f "$work/metadata.json"
cp "$settings" "$work/before"
boot
assert "an image without the metadata file still boots" "$(cat "$work/rc")" "0"
assert "and says why it did nothing, naming the file" "$(grep -cF "$work/metadata.json" "$work/out")" "1"
assert "leaving the settings alone" "$(cmp -s "$settings" "$work/before" && echo same || echo changed)" "same"

echo
echo "36-editor-settings.test: $pass passed, $fail failed."
[ "$fail" -eq 0 ]
