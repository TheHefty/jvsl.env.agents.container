# shellcheck shell=bash
# Sourced by the review's tests: stand-ins for bd and gh, so a test reads what
# the scripts asked for instead of changing a real tracker or a real PR.
#
# bd records each call, one per line, arguments joined by a tab, and answers
# `create` with $BD_NEW_ID.
# gh answers `gh pr view <n> --json state ...` from $GH_STATES (lines `n STATE`),
# and fails with $GH_FAIL on stderr when that is set.

stubs() {
    mkdir -p "$1"
    cat > "$1/bd" <<'SH'
#!/usr/bin/env bash
(IFS=$'\t'; echo "$*") >> "$BD_CALLS"
# `create --silent` prints only the new id, which the caller goes on to use.
[ "$1" = create ] && echo "${BD_NEW_ID:-j-new}"
exit 0
SH
    cat > "$1/gh" <<'SH'
#!/usr/bin/env bash
if [ -n "${GH_FAIL:-}" ]; then echo "$GH_FAIL" >&2; exit 1; fi
[ "$1 $2" = "pr view" ] || { echo "gh stub: unexpected $*" >&2; exit 2; }
state="$(awk -v n="$3" '$1 == n {print $2}' "$GH_STATES")"
[ -n "$state" ] || { echo "GraphQL: Could not resolve to a PullRequest with the number of $3." >&2; exit 1; }
printf '{"state":"%s"}\n' "$state"
SH
    chmod +x "$1/bd" "$1/gh"
}
