#!/usr/bin/env bash
# shellcheck disable=SC2088 # a literal ~: the paths are published from the home, as the agent names them
# Drives the real svc-measures run script against a /proc and a home this test
# builds, with a fake `du` and `s6-setuidgid`, a zero interval and a fixed
# number of passes so it ends (story 8u9.1, task 8u9.1.1).
#
# Its three worst failures, each a case below:
#   1. it publishes more of a command line than -X and -XX: a -Dtoken, or the
#      VS Code server's connection token, readable by the agent once story 2
#      maps the folder into the jail;
#   2. it runs `du` over a ~/.gradle of several gigabytes on every 30-second
#      pass, instead of every tenth minute;
#   3. a process that ends between the scan and the read, or a folder that is
#      not there, kills the script, and s6 restarts it until the reason scrolls
#      away — publishing nothing meanwhile.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/run"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
cat > "$work/bin/s6-setuidgid" <<'SH'
#!/usr/bin/env bash
echo "$1" > "$MEASURES_TEST_USER"
shift
exec "$@"
SH
# `du -sk DIR...`: one call recorded per invocation, a fixed size per folder.
cat > "$work/bin/du" <<'SH'
#!/usr/bin/env bash
echo call >> "$MEASURES_TEST_DU"
for a in "$@"; do case "$a" in -*) ;; *) printf '%s\t%s\n' 1024 "$a" ;; esac; done
SH
chmod +x "$work/bin/s6-setuidgid" "$work/bin/du"

proc="$work/proc"
home="$work/home"
out="$work/state/measures/editor.json"

# A process in the fake /proc: pid, resident KiB, then its argv.
process() {
    local pid="$1" rss="$2"; shift 2
    mkdir -p "$proc/$pid"
    printf '%s\0' "$@" > "$proc/$pid/cmdline"
    printf 'Name:\tx\nVmRSS:\t%s kB\n' "$rss" > "$proc/$pid/status"
}

run_passes() {
    local code=0
    : > "$work/du-calls"
    MEASURES_TEST_USER="$work/user" MEASURES_TEST_DU="$work/du-calls" PATH="$work/bin:$PATH" \
        MEASURES_PROC="$proc" MEASURES_HOME="$home" MEASURES_OUT="$out" \
        MEASURES_INTERVAL=0 MEASURES_FOLDER_PASSES=20 MEASURES_PASSES="$1" \
        timeout 60 bash "$SCRIPT" > "$work/out" 2>&1 || code=$?
    echo "$code" > "$work/rc"
}
get() { jq -r "$1" "$out" 2>/dev/null; }
reset() { rm -rf "$proc" "$home" "$work/state"; mkdir -p "$proc" "$home/.gradle/caches" "$home/.gradle/wrapper" "$home/.vscode-server/extensions"; }

# --- the language server's memory and flags are published ----------------------------

reset
process 101 2097152 /usr/lib/jvm/java/bin/java --add-modules=ALL-SYSTEM -Xmx2G -XX:+UseParallelGC \
    -Dtoken=secret -jar /config/.vscode-server/extensions/redhat.java-1.40.0/server/plugins/org.eclipse.equinox.launcher_1.6.900.jar \
    -configuration /config/.vscode-server/data/User/globalStorage/redhat.java/1.40.0/config_linux -data /tmp/jdt_ws
process 202 524288 /usr/lib/jvm/java/bin/java -Xmx512m -Dorg.gradle.appname=gradlew \
    org.gradle.launcher.daemon.bootstrap.GradleDaemon 8.14.3
process 303 262144 /config/.vscode-server/bin/abc123/node /config/.vscode-server/bin/abc123/out/server-main.js \
    --host=127.0.0.1 --connection-token=remote-secret-token
process 404 1000 /bin/bash
run_passes 1
check "a pass ends cleanly" "$(cat "$work/rc")" "0"
check "the service drops to abc before measuring" "$(cat "$work/user")" "abc"
check "the file is JSON" "$(jq -e . "$out" >/dev/null 2>&1 && echo yes || echo no)" "yes"
check "the language server's resident memory, in KiB" \
    "$(get '.processes[] | select(.name == "java-language-server") | .instances[0].rssKiB')" "2097152"
check "its -X and -XX arguments, and only those" \
    "$(get '.processes[] | select(.name == "java-language-server") | .instances[0].jvmArgs | join(" ")')" "-Xmx2G -XX:+UseParallelGC"
check "the Gradle daemon, with its own" \
    "$(get '.processes[] | select(.name == "gradle-daemon") | "\(.running) \(.instances[0].rssKiB) \(.instances[0].jvmArgs | join(" "))"')" "true 524288 -Xmx512m"
check "the VS Code server's resident memory" \
    "$(get '.processes[] | select(.name == "vscode-server") | "\(.running) \(.instances[0].rssKiB)"')" "true 262144"
check "each measure carries its time" \
    "$(get '[.processes[].measuredAt, .folders.measuredAt] | map(test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z$")) | all')" "true"

# --- 1. nothing else of a command line is published -----------------------------------

check "the -D token is not in the file" "$(grep -c 'secret' "$out")" "0"
check "nor the VS Code server's connection token" "$(grep -c 'remote-secret-token\|connection-token' "$out")" "0"
check "nor a path from any command line" "$(grep -c 'jdt_ws\|equinox\|server-main' "$out")" "0"
check "a process not on the list is not in it" "$(get '[.processes[].instances[].pid] | map(tostring) | index("404")')" "null"

# --- the folders: measured on the first pass, each first-level folder too ---------------

check "~/.gradle is measured" "$(get '.folders.sizes[] | select(.path == "~/.gradle") | .kib')" "1024"
check "and its first-level folders" \
    "$(get '[.folders.sizes[] | select(.path | startswith("~/.gradle/")) | .path] | sort | join(" ")')" "~/.gradle/caches ~/.gradle/wrapper"
check "~/.vscode-server and its folders too" \
    "$(get '[.folders.sizes[] | select(.path | startswith("~/.vscode-server")) | .path] | sort | join(" ")')" "~/.vscode-server ~/.vscode-server/extensions"

# --- 2. the folders are measured less often ----------------------------------------------

reset
process 202 524288 /usr/lib/jvm/java/bin/java -Xmx512m org.gradle.launcher.daemon.bootstrap.GradleDaemon 8.14.3
run_passes 3
check "three 30-second passes run du once, on the first" "$(wc -l < "$work/du-calls" | tr -d ' ')" "1"
check "and the folders measured then are still published" "$(get '.folders.sizes | length')" "5"

# --- a listed process that is not running is published as not running --------------------

check "the language server, absent, is not running" \
    "$(get '.processes[] | select(.name == "java-language-server") | "\(.running) \(.instances | length)"')" "false 0"

# --- 3. a process gone mid-read, a folder that is not there: still a whole file ----------

reset
rm -rf "$home/.gradle"
process 101 2097152 /usr/lib/jvm/java/bin/java -Xmx2G -jar /x/org.eclipse.equinox.launcher_1.jar -configuration /x/redhat.java/config_linux
rm "$proc/101/status"
mkdir -p "$proc/555"   # a pid whose files are already gone
process 202 524288 /usr/lib/jvm/java/bin/java -Xmx512m org.gradle.launcher.daemon.bootstrap.GradleDaemon 8.14.3
run_passes 2
check "a process gone between the scan and the read does not stop the service" "$(cat "$work/rc")" "0"
check "and the file is still whole JSON" "$(jq -e . "$out" >/dev/null 2>&1 && echo yes || echo no)" "yes"
check "and the processes still running are still published" \
    "$(get '.processes[] | select(.name == "gradle-daemon") | "\(.running) \(.instances[0].rssKiB)"')" "true 524288"
check "the one that went is not running" \
    "$(get '.processes[] | select(.name == "java-language-server") | .running')" "false"
check "a folder that is not there is published as absent" \
    "$(get '.folders.sizes[] | select(.path == "~/.gradle") | .absent')" "true"
check "and no temporary file is left beside the file" "$(find "$(dirname "$out")" -type f | wc -l | tr -d ' ')" "1"

if [ "$failures" -gt 0 ]; then echo "svc-measures/run.test: $failures failure(s)"; exit 1; fi
echo "svc-measures/run.test: the editor's processes are published with their resident memory and only -X/-XX, the folders every tenth minute, and nothing stops a pass from writing a whole file."
