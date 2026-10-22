# shellcheck shell=bash
# Sourced by reaper kinds that stop processes (see core/services/svc-reaper/run).
# Not a kind itself: it is installed beside reapers.d, not in it.
#
# What every such kind has to get right in the same way: reading /proc/<pid>/stat
# after the command name — which can hold spaces and parentheses — and never
# signalling a pid that was reused between the scan and the signal. Kept in one
# place so a fix to either reaches every kind.

REAPER_PROC_DIR="${REAPER_PROC:-/proc}"
REAPER_GRACE_SECONDS="${REAPER_GRACE:-5}"

# Field n of /proc/<pid>/stat counted after the closing parenthesis of the
# command name: 1 state, 2 ppid, 3 pgrp, ... 20 starttime.
reaper_field() { awk -v n="$2" '{print $n}' <<<"${1##*) }"; }

reaper_starttime() {
    local s
    s="$(cat "$REAPER_PROC_DIR/$1/stat" 2>/dev/null)" || return 1
    reaper_field "$s" 20
}

reaper_signal() {
    if [ -n "${REAPER_KILL:-}" ]; then "$REAPER_KILL" "-$1" "$2"; else kill "-$1" "$2"; fi
}

# reaper_stop pid starttime: TERM, then KILL once the grace period is over —
# each only while the pid still has the start time the scan saw. Returns 1 when
# it signalled nothing, because the process was gone or the pid reused.
reaper_stop() {
    local pid="$1" start="$2"
    [ "$(reaper_starttime "$pid")" = "$start" ] || return 1
    reaper_signal TERM "$pid" 2>/dev/null || return 1
    for _ in $(seq $((REAPER_GRACE_SECONDS * 10))); do
        [ -d "$REAPER_PROC_DIR/$pid" ] || return 0
        sleep 0.1
    done
    if [ "$(reaper_starttime "$pid")" = "$start" ]; then
        reaper_signal KILL "$pid" 2>/dev/null || true
    fi
    return 0
}
