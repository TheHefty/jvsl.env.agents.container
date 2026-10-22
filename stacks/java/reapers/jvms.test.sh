#!/usr/bin/env bash
# Exercises the jvms reaper kind, the real script, against a fake /proc and a
# stand-in for kill.
#
# Two kinds of JVM outlive their owner here (#187): a Kotlin compile daemon
# whose Gradle daemon was killed, and a Java language server whose editor
# window went away. Each is recognised by its own owner being gone, and nothing
# else is touched. The failures this guards: a live language server stopped —
# which costs a person their editor's Java support with no explanation — a
# Kotlin daemon stopped while a build uses it, and any other JVM touched.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/jvms"
LIB="$HERE/../../../core/reapers/reaper-lib.sh"

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
proc="$work/proc"
ME=911

cat > "$work/kill" <<'SH'
#!/usr/bin/env bash
sig="${1#-}"; pid="$2"
echo "$sig $pid" >> "$SIGNALS"
if [ "$sig" = KILL ] || ! grep -qx "$pid" "$STUBBORN" 2>/dev/null; then rm -rf "${PROC:?}/$pid"; fi
SH
chmod +x "$work/kill"

# p pid comm ppid uid rss_kb cmdline...
p() {
    local pid="$1" comm="$2" ppid="$3" uid="$4" rss="$5"; shift 5
    mkdir -p "$proc/$pid"
    printf '%s (%s) S %s %s %s 0 -1 0 0 0 0 0 0 0 0 0 20 0 30 0 %s 0 0\n' "$pid" "$comm" "$ppid" "$pid" "$pid" "$((pid * 7))" > "$proc/$pid/stat"
    printf 'Name:\t%s\nUid:\t%s\t%s\t%s\t%s\nVmRSS:\t%s kB\n' "$comm" "$uid" "$uid" "$uid" "$uid" "$rss" > "$proc/$pid/status"
    printf '%s\0' "$@" > "$proc/$pid/cmdline"
}
init() { p 1 s6-svscan 0 0 1000 /package/admin/s6/command/s6-svscan /run/service; }
kotlin() { p "$1" java "$2" $ME 693248 /usr/lib/jvm/stack-java/bin/java -Xmx512m -cp k.jar org.jetbrains.kotlin.daemon.KotlinCompileDaemon --daemon-autoshutdownIdleSeconds=600; }
gradle() { p "$1" java "$2" $ME 600000 /usr/lib/jvm/stack-java/bin/java -Xmx512m -cp g.jar org.gradle.launcher.daemon.bootstrap.GradleDaemon 8.14.3; }
jdtls() { p "$1" java "$2" $ME 427008 /config/.vscode-server/extensions/redhat.java-1.59.0/jre/bin/java -Djava.import.generatesMetadataFilesAtProjectRoot=false -jar /config/.vscode-server/extensions/redhat.java-1.59.0/server/plugins/org.eclipse.equinox.launcher_1.7.0.jar -configuration /config/.vscode-server/data/User/globalStorage/redhat.java/1.59.0/config_linux -data /config/.vscode-server/data/User/workspaceStorage/x/redhat.java/jdt_ws; }
# The extension host as the kernel shows it: node names its main thread, so its
# comm is MainThread, not node (seen in kotodori on 2026-10-22, debt 6r9).
exthost() { p "$1" MainThread "$2" $ME 300000 /config/.vscode-server/bin/abc/node --dns-result-order=ipv4first /config/.vscode-server/bin/abc/out/bootstrap-fork --type=extensionHost; }

reset() { rm -rf "$proc" "$work/signals" "$work/stubborn"; mkdir -p "$proc"; : > "$work/signals"; init; }
reap() {
    local code=0
    PROC="$proc" SIGNALS="$work/signals" STUBBORN="$work/stubborn" \
        REAPER_PROC="$proc" REAPER_KILL="$work/kill" REAPER_GRACE=1 REAPER_UID="$ME" \
        REAPER_LIB="$LIB" REAPER_BETWEEN="${BETWEEN:-}" \
        timeout 60 bash "$SCRIPT" > "$work/out" 2> "$work/err" || code=$?
    echo "$code" > "$work/rc"
}
signalled() { awk '{print $2}' "$work/signals" | sort -u | tr '\n' ' '; }

# --- Kotlin daemons ---------------------------------------------------------------

reset; kotlin 89784 1
reap
check "a Kotlin daemon with no Gradle daemon left is stopped" "$(signalled)" "89784 "
check "asked first" "$(head -1 "$work/signals")" "TERM 89784"
check "and its line names it, its pid, its memory, and why" "$(cat "$work/out")" \
    "KotlinCompileDaemon pid 89784 (677M, no Gradle daemon is left)"
check "the kind exits 0" "$(cat "$work/rc")" "0"

reset; kotlin 89784 1; echo 89784 > "$work/stubborn"
reap
check "one that ignores TERM is forced" "$(grep -c '^KILL 89784$' "$work/signals")" "1"

reset; kotlin 89784 1; gradle 2444 1
reap
check "any live Gradle daemon keeps every Kotlin daemon, even an orphaned one" "$(signalled)" ""

# --- language servers ---------------------------------------------------------------

reset; jdtls 3737 1
reap
check "a language server re-parented to init, with no editor above it, is stopped" "$(signalled)" "3737 "
check "and says its editor is gone" "$(cat "$work/out")" "Java language server pid 3737 (417M, its editor is gone)"

reset; exthost 765 1; jdtls 100989 765
reap
check "a language server under a live extension host is kept" "$(signalled)" ""

reset; exthost 765 1; p 800 bash 765 $ME 4000 /bin/bash -c launch; jdtls 100989 800
reap
check "a shell between it and the editor does not make it an orphan" "$(signalled)" ""

reset; exthost 1312 785; p 785 MainThread 769 $ME 200000 /config/.vscode-server/bin/abc/node server-main.js; p 769 sh 1 $ME 2000 sh -c server; jdtls 95200 1312
reap
check "a language server under the server's real process chain is kept (debt 6r9)" "$(signalled)" ""

reset; p 50 s6-supervise 1 0 1000 s6-supervise svc-x; jdtls 3737 50
reap
check "one whose parent is anything but init is kept: no name decides an orphan" "$(signalled)" ""

# --- everything else -----------------------------------------------------------------

reset
p 4000 java 1 $ME 900000 /usr/lib/jvm/stack-java/bin/java -jar app.jar
p 4001 java 1 $ME 400000 /usr/lib/jvm/stack-java/bin/java -cp w.jar worker.org.gradle.process.internal.worker.GradleWorkerMain "Gradle Test Executor 3"
p 4002 java 1 1000 693248 /usr/lib/jvm/stack-java/bin/java org.jetbrains.kotlin.daemon.KotlinCompileDaemon
reap
check "an application, a test executor, and another user's Kotlin daemon are never touched" "$(signalled)" ""

reset; kotlin 89784 1
BETWEEN="printf '89784 (sshd) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 30 0 1 0 0\n' > '$proc/89784/stat'" reap
check "a pid whose start time changed since the scan is not signalled" "$(signalled)" ""

if [ "$failures" -gt 0 ]; then
    echo "reapers/jvms.test: $failures failure(s)"
    exit 1
fi
echo "reapers/jvms.test: a Kotlin daemon with no Gradle daemon left and a language server with no editor above it are stopped, asked before forced; nothing else, and no reused pid, is."
