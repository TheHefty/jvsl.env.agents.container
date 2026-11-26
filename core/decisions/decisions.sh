# shellcheck shell=bash
# Sourced by the boot hooks and the reaper: what each decided, one line per
# decision, in one log (epic the-container-says-what-its-boot-hooks-decided-
# where-the-developer-looks, task djy.1.1). Installed at
# /usr/local/lib/jvsl/decisions.sh.
#
# **Why one log.** 36-editor-settings keeps a setting the developer changed,
# 35-editor-extensions removes the marker so a new stack's extension installs,
# the reaper kills leftovers — and the evidence for each was read by hand from
# `docker logs | grep` and reaper.log. One file, in the place only the
# developer reads: /config/.local/state/jvsl/, which the jail does not map.
#
# **A line is `<UTC time> <who>: <what>`**, and the caller is what keeps a
# setting's value out of <what>: by key, never by value.
#
# **Bounded as reaper.log was**: rotated to one .1 before the line that would
# cross DECISIONS_LOG_MAX, so neither file passes it. The recent boots, not a
# history.
#
# **Written as DECISIONS_WRITE_AS says.** The hooks run as root and set it to
# `s6-setuidgid abc`: a log created as root is one the reaper, running as abc,
# can no longer append to, and its lines would vanish with nothing saying so.
#
# **Never the reason a caller stops.** The hooks run under `set -e`, and a log
# that cannot be written is said on stderr and otherwise ignored: a boot hook
# that died over a line would leave the editor's settings unwritten.

DECISIONS_LOG="${DECISIONS_LOG:-/config/.local/state/jvsl/decisions.log}"
DECISIONS_LOG_MAX="${DECISIONS_LOG_MAX:-262144}"
DECISIONS_WRITE_AS="${DECISIONS_WRITE_AS:-}"

# decision WHO WHAT...
decision() {
    local who="$1" line size
    shift
    line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $who: $*"
    # shellcheck disable=SC2086 # the prefix is a command and its arguments
    if ! $DECISIONS_WRITE_AS mkdir -p "$(dirname "$DECISIONS_LOG")" 2>/dev/null; then
        echo "decisions: could not create the folder of $DECISIONS_LOG, so this was not logged: $who: $*" >&2
        return 0
    fi
    size="$(stat -c %s "$DECISIONS_LOG" 2>/dev/null || echo 0)"
    if [ "$size" -gt 0 ] && [ $(( size + ${#line} + 1 )) -gt "$DECISIONS_LOG_MAX" ]; then
        # shellcheck disable=SC2086
        $DECISIONS_WRITE_AS mv -f "$DECISIONS_LOG" "$DECISIONS_LOG.1" 2>/dev/null || true
    fi
    # shellcheck disable=SC2086
    if ! printf '%s\n' "$line" | $DECISIONS_WRITE_AS tee -a "$DECISIONS_LOG" >/dev/null 2>&1; then
        echo "decisions: could not write to $DECISIONS_LOG, so this was not logged: $who: $*" >&2
    fi
    return 0
}
