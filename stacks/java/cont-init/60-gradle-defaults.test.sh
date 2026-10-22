#!/usr/bin/env bash
# Exercises the Java stack's Gradle-defaults boot hook, the real script, against
# a real file tree.
#
# **What this owns is somebody else's file.** /config/.gradle/gradle.properties
# is the person's: it is where repository tokens and signing keys live, and the
# hook runs as root on every boot. So the failures that matter are the ones that
# would make it worse than its absence — a line of theirs lost or changed, a
# 0600 file left readable, a write through a symlink, a secret in the boot log,
# a boot that stops over a Gradle default. Each is a check below.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/60-gradle-defaults.sh"
SHIPPED="$HERE/../gradle.properties"

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
trap 'chmod -R u+w "$work" 2>/dev/null; rm -rf "$work"' EXIT

defaults="$work/defaults.properties"
cp "$SHIPPED" "$defaults"
home="$work/config/.gradle"
target="$home/gradle.properties"

boot() {
    local code=0
    GRADLE_DEFAULTS="$defaults" GRADLE_USER_PROPS="$target" \
        GRADLE_PROPS_OWNER="$(id -u):$(id -g)" \
        timeout 30 bash "$SCRIPT" > "$work/out" 2>&1 || code=$?
    echo "$code" > "$work/rc"
}
rc() { cat "$work/rc"; }
out() { cat "$work/out"; }
mode() { stat -c %a "$1"; }
# Everything after the block, which is the part that belongs to the person.
after_block() { sed '1,/^# <<< jvsl java stack/d' "$1"; }

SECRET='mavenToken=s3cr3t-do-not-print'

# --- what ships ---------------------------------------------------------------

check "the shipped defaults carry no org.gradle.jvmargs (it would override the project's own bound)" \
    "$(grep -c '^org.gradle.jvmargs' "$SHIPPED" || true)" "0"
check "the shipped defaults set the daemon idle timeout" \
    "$(grep -c '^org.gradle.daemon.idletimeout=600000$' "$SHIPPED")" "1"
check "the shipped defaults set the Kotlin daemon's idle shutdown" \
    "$(grep -c '^systemProp.kotlin.daemon.options=autoshutdownIdleSeconds=600$' "$SHIPPED")" "1"

# --- a person with no file yet ------------------------------------------------

boot
check "a first boot with no file exits 0" "$(rc)" "0"
check "the file is created" "$([ -f "$target" ] && echo yes)" "yes"
check "a created file is 0600, because this is where credentials end up" "$(mode "$target")" "600"
check "the block is at the top, so a line of the person's below it wins" \
    "$(head -1 "$target" | cut -c1-24)" "# >>> jvsl java stack: G"
check "the defaults are in the block" \
    "$(grep -c '^org.gradle.daemon.idletimeout=600000$' "$target")" "1"

# --- a person with their own file --------------------------------------------

rm -rf "$home"; mkdir -p "$home"
# No trailing newline on purpose: a rewrite that normalises it has changed
# bytes it does not own.
printf '# mine\norg.gradle.daemon.idletimeout=60000\n%s' "$SECRET" > "$target"
chmod 600 "$target"
theirs="$(cat "$target"; echo x)"

boot
check "a boot over the person's file exits 0" "$(rc)" "0"
check "every byte of theirs is kept, after the block" "$(after_block "$target"; echo x)" "$theirs"
check "their 0600 stays 0600" "$(mode "$target")" "600"
check "the boot log never carries the file's contents" "$(out | grep -c 's3cr3t' || true)" "0"
check "their own idle timeout comes after the stack's, so theirs is the one Gradle reads" \
    "$(grep -n 'idletimeout' "$target" | tail -1 | cut -d= -f2)" "60000"

before="$(sha256sum "$target") $(stat -c %Y "$target")"
sleep 1
boot
check "a second boot changes nothing, not even the mtime" \
    "$(sha256sum "$target") $(stat -c %Y "$target")" "$before"

# An image update changes the defaults: the block is replaced, theirs is not.
sed -i 's/600000/900000/' "$defaults"
boot
check "a changed default replaces the block" "$(grep -c '^org.gradle.daemon.idletimeout=900000$' "$target")" "1"
check "only one block, ever" "$(grep -c '^# >>> jvsl java stack' "$target")" "1"
check "and theirs is still byte-for-byte" "$(after_block "$target"; echo x)" "$theirs"
cp "$SHIPPED" "$defaults"

chmod 640 "$target"; boot
check "a 0640 file stays 0640: the mode is theirs, not this hook's" "$(mode "$target")" "640"

# --- what it must refuse ------------------------------------------------------

rm -rf "$home"; mkdir -p "$home"
printf 'elsewhere=1\n' > "$work/elsewhere"
ln -s "$work/elsewhere" "$target"
boot
check "a symlink is refused, and the boot goes on" "$(rc)" "0"
check "nothing is written through it" "$(cat "$work/elsewhere")" "elsewhere=1"
check "it is still a symlink" "$([ -L "$target" ] && echo yes)" "yes"
check "the refusal names the path" "$(out | grep -c -- "$target" || true)" "1"

rm -rf "$home"; mkdir -p "$home"; chmod 500 "$home"
boot
check "a directory it cannot write to does not stop the boot" "$(rc)" "0"
check "and says so, naming the path" "$(out | grep -c -- "$home" || true)" "1"
chmod 700 "$home"

rm -rf "$home"
rm -f "$defaults"
boot
check "an image without the defaults file writes nothing and does not stop the boot" \
    "$(rc) $([ -e "$target" ] && echo written || echo absent)" "0 absent"
check "and says why, once" "$(out | grep -c . || true)" "1"

if [ "$failures" -gt 0 ]; then
    echo "60-gradle-defaults.test: $failures failure(s)"
    exit 1
fi
echo "60-gradle-defaults.test: the defaults are merged above the person's own lines, which are kept to the byte and the mode, never printed, never written through a symlink, and nothing here can stop a boot."
