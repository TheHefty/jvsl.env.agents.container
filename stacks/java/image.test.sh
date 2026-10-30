#!/usr/bin/env bash
# Runs INSIDE a built java-stack image. Asserts that the JDK the editor is told
# to use is there, and is the version the stack installed.
#
# Debt the-editor-imports-gradle-with-a-java-the-project-does-not-use: the
# editor imported Gradle with the JRE it bundles (25), and Gradle 8.14 refused,
# because the stack named no JDK. The stack's devcontainer.json now names
# /usr/lib/jvm/stack-java; a link that points nowhere, or at another version,
# would put the same failure back with nothing to say why.
set -uo pipefail

failures=0
fail() { echo "FAIL $*"; failures=$((failures + 1)); }

link=/usr/lib/jvm/stack-java
target="$(readlink -f "$link" 2>/dev/null || true)"
[ -n "$target" ] && [ -x "$target/bin/java" ] && [ -x "$target/bin/javac" ] \
    || fail "$link is not a JDK (resolves to '${target:-nothing}'); the editor is told to import Gradle with it"

[ "${JAVA_HOME:-}" = "$link" ] || fail "JAVA_HOME is '${JAVA_HOME:-unset}', not $link"

# The installed version is the number in Debian's directory name.
want="$(basename "$target" | sed -nE 's/^java-([0-9]+)-openjdk.*/\1/p')"
got="$("$link/bin/java" -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -1)"
[ -n "$want" ] && [ "$got" = "$want" ] || fail "$link runs Java '$got', and the JDK it points at is '$want'"

# The Gradle defaults (#187): the image's file is there and nobody but root can
# change it, the hook is installed, and the hook works with what *this* image
# has — perl, chown --reference, an 'abc' to own the file — which the unit test
# beside it cannot know.
defaults=/etc/jvsl/gradle.properties
[ "$(stat -c '%U %a' "$defaults" 2>/dev/null)" = "root 644" ] \
    || fail "$defaults is '$(stat -c '%U %a' "$defaults" 2>&1)', not 'root 644'; the agent's sandbox maps it as the stack's defaults"
! grep -q '^org.gradle.jvmargs' "$defaults" 2>/dev/null \
    || fail "$defaults sets org.gradle.jvmargs, which would override a project's own bound"
hook=/custom-cont-init.d/60-gradle-defaults.sh
[ -x "$hook" ] || fail "$hook is not installed, so nothing applies the Gradle defaults at boot"
scratch="$(mktemp -d)"
printf 'mine=1' > "$scratch/gradle.properties"
GRADLE_USER_PROPS="$scratch/gradle.properties" bash "$hook" >/dev/null 2>&1
grep -qx 'org.gradle.daemon.idletimeout=600000' "$scratch/gradle.properties" \
    && [ "$(tail -c 6 "$scratch/gradle.properties")" = "mine=1" ] \
    || fail "$hook did not merge the defaults above an existing file in this image"
rm -rf "$scratch"
# The reaper's Testcontainers kind is installed where the reaper looks, and the
# tools it leans on are the ones this image has: GNU find's -printf, getconf
# for the clock tick, timeout, jq.
kind=/usr/local/lib/jvsl/reapers.d/testcontainers
[ -x "$kind" ] || fail "$kind is not installed, so dead test runs' containers are never reaped"
[ -x /usr/local/lib/jvsl/reapers.d/jvms ] \
    || fail "/usr/local/lib/jvsl/reapers.d/jvms is not installed, so orphaned Kotlin daemons and language servers are never reaped"
for tool in getconf timeout jq; do
    command -v "$tool" >/dev/null || fail "$tool is missing; $kind needs it"
done
find /proc/self/fd/ -maxdepth 1 -type l -printf '%l\n' >/dev/null 2>&1 \
    || fail "find has no -printf here; $kind reads open files with it"

# The editor is told not to import what is under .claude, where Claude Code
# keeps its worktrees (debt the-editor-imports-claude-codes-worktrees-as-java-
# projects): in kotodori on 2026-10-29 a worktree's copy of build-logic was
# imported, and brought a Gradle 9.8.1 daemon of its own. Read from the file
# 36-editor-settings.sh delivers to the editor. Setting the key replaces
# redhat.java's own defaults, so each of them has to be in the list too.
meta="${STACK_METADATA:-/opt/jvsl/devcontainer-metadata.json}"
exclusions="$(jq -c '[.[] | .customizations.vscode.settings["java.import.exclusions"] // empty] | last // []' "$meta" 2>/dev/null)"
for pattern in '**/.claude/**' '**/node_modules/**' '**/.metadata/**' '**/archetype-resources/**' '**/META-INF/maven/**'; do
    jq -e --arg p "$pattern" 'index($p) != null' <<<"${exclusions:-[]}" >/dev/null \
        || fail "java.import.exclusions in $meta lacks $pattern (it is ${exclusions:-absent}); the editor would import it as Java projects"
done

[ "$failures" -eq 0 ] && echo "ok   $link is a JDK $got, and JAVA_HOME names it; the Gradle defaults are installed and the hook merges them"
exit "$failures"
