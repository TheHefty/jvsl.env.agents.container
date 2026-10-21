#!/usr/bin/env bash
# custom-cont-init.d script: runs as root, before s6-overlay drops privileges
# to 'abc'. Puts the Java stack's Gradle defaults at the top of the person's
# Gradle user-home gradle.properties, and leaves everything else in it alone.
#
# **What the defaults are for** (#187, measured on 2026-10-21 with Gradle
# 8.14.3 and Kotlin 2.1.21). The heaps are already bounded: a Gradle daemon
# starts with -Xmx512m and its Kotlin compile daemon inherits it. Their
# lifetimes are not. An idle Gradle daemon lives three hours, a Kotlin daemon
# two, and a Kotlin daemon whose Gradle daemon was OOM-killed is re-parented to
# PID 1 and lives out its two hours holding half a gigabyte. Ten minutes for
# both is what /etc/jvsl/gradle.properties says; measured, the user home is
# what reaches the daemons the editor starts through the tooling API, which
# GRADLE_OPTS does not.
#
# **No org.gradle.jvmargs, and that is a decision.** A user-home value beats
# the project's own gradle.properties, so a bound here would take a larger one
# away from a project that asked for it, silently.
#
# **The person's file is theirs.** It is where repository tokens and signing
# keys live. So: the block goes at the top and their lines follow it to the
# byte, which also means a line of theirs wins (the last occurrence of a key is
# the one Gradle reads); the mode and owner are kept; a symlink is refused
# rather than written through as root; the contents are never printed. And
# nothing here stops a boot — a Gradle default is not worth a container that
# does not start.
#
# The agent's sandbox does not see this file at all: core/bin/jail-common.sh
# maps /etc/jvsl/gradle.properties over it, read-only, so the agent gets the
# same defaults and none of the person's credentials.
set -uo pipefail

# Overridable so the test beside this file can run without root or /config.
DEFAULTS="${GRADLE_DEFAULTS:-/etc/jvsl/gradle.properties}"
TARGET="${GRADLE_USER_PROPS:-/config/.gradle/gradle.properties}"
OWNER="${GRADLE_PROPS_OWNER:-abc:abc}"
DIR="$(dirname "$TARGET")"

say() { echo "60-gradle-defaults: $*"; }

if [ ! -f "$DEFAULTS" ]; then
    say "no $DEFAULTS in this image, so $TARGET was left alone"
    exit 0
fi
if [ -L "$TARGET" ]; then
    say "refused: $TARGET is a symlink, and this runs as root; the Gradle defaults were not applied"
    exit 0
fi

BEGIN='# >>> jvsl java stack: Gradle defaults, rewritten on every boot. A line of yours below this block wins. >>>'
END='# <<< jvsl java stack <<<'

block="$(printf '%s\n' "$BEGIN"; cat "$DEFAULTS"; printf '%s\n' "$END")"

theirs=""
if [ -f "$TARGET" ]; then
    # The whole file as one string, so the block is removed as a unit wherever
    # it is, and a missing final newline stays missing: that byte is not this
    # hook's to change, and awk would add it. LC_ALL=C because perl otherwise
    # warns about the container's locale into the boot log, every boot.
    theirs="$(LC_ALL=C perl -0777 -pe 's/^# >>> jvsl java stack[^\n]*\n.*?^# <<< jvsl java stack[^\n]*\n?//ms' "$TARGET"; echo x)"
    theirs="${theirs%x}"
fi
wanted="$block"$'\n'"$theirs"

if [ -f "$TARGET" ] && [ "$(cat "$TARGET"; echo x)" = "${wanted}x" ]; then
    exit 0
fi

if ! mkdir -p "$DIR" 2>/dev/null || ! tmp="$(mktemp "$DIR/.gradle.properties.XXXXXX" 2>/dev/null)"; then
    say "could not write in $DIR; the Gradle defaults were not applied (daemons keep Gradle's own idle times)"
    exit 0
fi

if [ -f "$TARGET" ]; then
    chmod --reference="$TARGET" "$tmp" && chown --reference="$TARGET" "$tmp" 2>/dev/null
else
    chmod 600 "$tmp" && chown "$OWNER" "$tmp" 2>/dev/null && chown "$OWNER" "$DIR" 2>/dev/null
fi

if printf '%s' "$wanted" > "$tmp" && mv -f "$tmp" "$TARGET"; then
    say "applied the Gradle defaults from $DEFAULTS to the top of $TARGET"
else
    rm -f "$tmp"
    say "could not replace $TARGET; the Gradle defaults were not applied"
fi
exit 0
