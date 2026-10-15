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

[ "$failures" -eq 0 ] && echo "ok   $link is a JDK $got, and JAVA_HOME names it"
exit "$failures"
