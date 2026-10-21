#!/usr/bin/env bash
# Exercises the Testcontainers reaper kind, the real script, against a docker
# stand-in and a fake /proc.
#
# **The whole difficulty is telling a dead run from a live one**, and the cost
# is lopsided: an orphan left one more pass costs memory for five minutes; a
# live run's database removed mid-suite is a build that fails naming nothing.
# Testcontainers' session id lives only in the JVM's memory, so the kind cannot
# match a container to its owner. It asks instead whether any live JVM that
# could have created the container started before it did.
#
# **The docker stand-in ignores filters on purpose.** `docker ps --filter` is
# the first line of defence, not the only one: a container that is not
# Testcontainers' has to be refused by the kind's own reading of its labels.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/testcontainers"

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
trap 'chmod -R u+rwx "$work" 2>/dev/null; rm -rf "$work"' EXIT

NOW=2000000000          # "now", in epoch seconds
BOOT=$((NOW - 86400))   # the machine booted a day ago
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%S.000000000Z; }

# --- the docker stand-in --------------------------------------------------------

cat > "$work/docker" <<'SH'
#!/usr/bin/env bash
[ -n "${DOCKER_HANGS:-}" ] && exec sleep 1000
[ -n "${DOCKER_DOWN:-}" ] && { echo "Cannot connect to the Docker daemon at unix:///nowhere.sock" >&2; exit 1; }
case "$1" in
    ps)      jq -r '.[].Id' "$FIXTURE" ;;
    inspect) shift; [ "$1" = --format ] && shift 2
             jq --args '[.[] | select(.Id as $i | $ARGS.positional | index($i))]' "$@" < "$FIXTURE" ;;
    rm)      shift; [ "$1" = -f ] && shift; echo "$1" >> "$REMOVED" ;;
    *)       echo "docker stand-in: unexpected $*" >&2; exit 2 ;;
esac
SH
chmod +x "$work/docker"

containers=()
container() {
    # id state created_ago finished_ago labels-json [image]
    local id="$1" state="$2" created=$((NOW - $3)) finished=$((NOW - $4)) labels="$5" image="${6:-postgres:18-alpine}"
    containers+=("$(jq -n --arg id "$id" --arg st "$state" --arg c "$(iso $created)" \
        --arg s "$(iso $created)" --arg f "$(iso $finished)" --arg img "$image" --argjson l "$labels" \
        '{Id: $id, Created: $c, State: {Status: $st, StartedAt: $s, FinishedAt: $f},
          Config: {Image: $img, Labels: $l}}')")
}
TC='{"org.testcontainers": "true", "org.testcontainers.sessionId": "5b1c"}'

# --- the fake /proc -------------------------------------------------------------

proc="$work/proc"
jvm() {
    # pid started_ago kind   kind: jar | runner | unreadable | plain
    local pid="$1" started=$((NOW - $2)) kind="$3" hz
    hz="$(getconf CLK_TCK)"
    mkdir -p "$proc/$pid/fd"
    # comm in parentheses with a space in it, as real JVM threads have, so a
    # naive split on spaces would read the wrong field.
    printf '%s (java main) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 30 0 %s 0 0\n' \
        "$pid" "$(( (started - BOOT) * hz ))" > "$proc/$pid/stat"
    case "$kind" in
        runner) printf '/usr/lib/jvm/stack-java/bin/java\0-cp\0x.jar\0worker.org.gradle.process.internal.worker.GradleWorkerMain\0Gradle Test Executor 3\0' ;;
        *)      printf '/usr/lib/jvm/stack-java/bin/java\0-cp\0x.jar\0Main\0' ;;
    esac > "$proc/$pid/cmdline"
    ln -s /config/.gradle/caches/modules-2/files-2.1/rt.jar "$proc/$pid/fd/3"
    [ "$kind" = jar ] && ln -s /config/.gradle/caches/modules-2/files-2.1/org.testcontainers/testcontainers/2.0.5/abc/testcontainers-2.0.5.jar "$proc/$pid/fd/7"
    [ "$kind" = unreadable ] && chmod 000 "$proc/$pid/fd"
    return 0
}
not_java() {
    local pid="$1"
    mkdir -p "$proc/$pid/fd"
    printf '%s (node) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 30 0 100 0 0\n' "$pid" > "$proc/$pid/stat"
    printf 'node\0server.js\0' > "$proc/$pid/cmdline"
    ln -s /x/testcontainers-2.0.5.jar "$proc/$pid/fd/9"
}

reset() {
    containers=()
    chmod -R u+rwx "$proc" 2>/dev/null || true
    rm -rf "$proc" "$work/removed"; mkdir -p "$proc"
    printf 'cpu  1 2 3\nbtime %s\n' "$BOOT" > "$proc/stat"
    : > "$work/removed"
}
reap() {
    printf '%s\n' "${containers[@]}" | jq -s . > "$work/fixture.json"
    local code=0
    FIXTURE="$work/fixture.json" REMOVED="$work/removed" \
        REAPER_DOCKER="$work/docker" REAPER_PROC="$proc" REAPER_NOW="$NOW" \
        REAPER_DOCKER_TIMEOUT="${TIMEOUT:-5}" \
        timeout 30 bash "$SCRIPT" > "$work/out" 2> "$work/err" || code=$?
    echo "$code" > "$work/rc"
}
removed() { sort "$work/removed" | tr '\n' ' '; }

# --- dead runs are reaped -------------------------------------------------------

reset
container exited1 exited $((40 * 3600)) $((39 * 3600)) "$TC"
reap
check "an exited Testcontainers container with no live JVM is removed" "$(removed)" "exited1 "
check "and the line says what, and why" "$(cat "$work/out")" \
    "postgres:18-alpine container exited1 (exited 39h ago, no live JVM could own it)"
check "the kind exits 0" "$(cat "$work/rc")" "0"

reset
container running1 running $((2 * 3600)) 0 "$TC"
jvm 4100 600 jar       # a test JVM, but it started ten minutes ago: after the container
reap
check "a running one whose possible owners all started after it is removed" "$(removed)" "running1 "
check "and says how long it ran" "$(cat "$work/out")" \
    "postgres:18-alpine container running1 (running 2h, no live JVM could own it)"

reset
container created1 created 300 300 "$TC"
reap
check "one that was created and never started is removed too" "$(removed)" "created1 "
check "and says so" "$(cat "$work/out")" \
    "postgres:18-alpine container created1 (never started, created 5m ago, no live JVM could own it)"

# --- live runs are never touched ------------------------------------------------

reset
container live1 running 600 0 "$TC"
container live2 exited 600 300 "$TC"
jvm 4200 3600 jar      # started an hour ago, holds the testcontainers jar
reap
check "a JVM holding the testcontainers jar that started before keeps them, running or exited" "$(removed)" ""
check "and nothing is printed for what was kept" "$(cat "$work/out")" ""

reset
container live3 running 600 0 "$TC"
jvm 4300 3600 runner   # a Gradle test executor, jar not visible in its fds
reap
check "a test runner named only in its command line keeps it" "$(removed)" ""

reset
container live4 running 600 0 "$TC"
jvm 4400 3600 unreadable   # fds that cannot be read: it cannot be ruled out
reap
check "a JVM whose open files cannot be read keeps it: when it cannot tell, it leaves it" "$(removed)" ""

reset
container dead1 running 600 0 "$TC"
jvm 4500 3600 plain    # a JVM that is neither: an editor's language server, say
not_java 4600          # not a JVM at all, even with the jar open
reap
check "a JVM that is no test run, and a process that is no JVM, keep nothing" "$(removed)" "dead1 "

# --- what is not Testcontainers' is never touched --------------------------------

reset
container compose1 running 99999 0 '{"com.docker.compose.project": "kotodori"}' postgres:18
container compose2 exited 99999 99999 '{"com.docker.compose.project": "kotodori"}' postgres:18
container plain1 exited 99999 99999 '{}' alpine
container nottc running 99999 0 '{"org.testcontainers": "false"}'
container reuse1 running 99999 0 '{"org.testcontainers": "true", "org.testcontainers.hash": "9f8e"}'
container reuse2 exited 99999 99999 '{"org.testcontainers": "true", "org.testcontainers.hash": "9f8e"}'
reap
check "compose stacks, unlabelled containers, org.testcontainers=false and reuse are never removed" "$(removed)" ""
check "and the kind still exits 0" "$(cat "$work/rc")" "0"

# --- a daemon that will not answer -------------------------------------------------

reset
container exited2 exited 99999 99999 "$TC"
start=$(date +%s)
DOCKER_HANGS=1 TIMEOUT=2 reap
check "a hanging daemon makes the kind give up within its bound" \
    "$([ $(( $(date +%s) - start )) -lt 15 ] && echo yes || echo no)" "yes"
check "and exit non-zero, so the frame says it once" "$(cat "$work/rc")" "1"
check "with a reason as its last line" "$(tail -n 1 "$work/err" | grep -c 'did not answer within 2s')" "1"
check "and nothing was removed" "$(removed)" ""

reset
container exited3 exited 99999 99999 "$TC"
DOCKER_DOWN=1 reap
check "an unreachable daemon is a non-zero exit" "$(cat "$work/rc")" "1"
check "whose last line is docker's own reason" "$(tail -n 1 "$work/err" | grep -c 'Cannot connect to the Docker daemon')" "1"

if [ "$failures" -gt 0 ]; then
    echo "reapers/testcontainers.test: $failures failure(s)"
    exit 1
fi
echo "reapers/testcontainers.test: dead runs' containers are removed and named, a JVM that could own one keeps it, nothing that is not Testcontainers' is touched, and a daemon that will not answer is a bounded, explained failure."
