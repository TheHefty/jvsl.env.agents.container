#!/usr/bin/env bash
# The hook is four lines of copying. **The part that has to be seen failing is
# the refusal**, because what it refuses is writing into the person's own
# `~/.claude` — which is a bind mount, so one project's rules would appear in
# every project on that machine, and the first symptom is a rule they never set
# being in force somewhere unrelated.
#
# A declaration in the generated configuration is not a guarantee the hook holds.
# This asserts the hook's own check.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${HOOK_UNDER_TEST:-$HERE/50-agent-rules.sh}"
pass=0
fail=0

[ -x "$HOOK" ] || { echo "50-agent-rules.test: FAIL: $HOOK is missing or not executable" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# A source with the documents, and a mounts file that claims the target is one.
setup() {
    local n="$1"
    rm -rf "$tmp/$n"
    mkdir -p "$tmp/$n/src" "$tmp/$n/target"
    printf '# modes\n' > "$tmp/$n/src/MODES.md"
    printf '# rules\n' > "$tmp/$n/src/RULES.md"
    printf '# initialization, which must not travel\n' > "$tmp/$n/src/INITIALIZATION.md"
    printf 'tmpfs %s/%s/target tmpfs rw 0 0\n' "$tmp" "$n" > "$tmp/$n/mounts"
}

run() {
    local n="$1"
    AGENT_DOCS_DIR="$tmp/$n/src" AGENT_RULES_DIR="$tmp/$n/target" \
        AGENT_RULES_MOUNTS="$tmp/$n/mounts" bash "$HOOK" 2>&1
}

check() {
    local name="$1" want="$2" got="$3"
    if [ "$want" = "$got" ]; then
        echo "ok      $name"
        pass=$((pass + 1))
    else
        echo "NOT OK  $name — wanted $want, got $got" >&2
        fail=$((fail + 1))
    fi
}

# --- the healthy path
setup ok
out="$(run ok)"
check "both governing documents are written" "MODES.md RULES.md" \
    "$(cd "$tmp/ok/target" && ls | sort | tr '\n' ' ' | sed 's/ $//')"
# **Silence is the only observable proof that a healthy boot did no talking.**
# Asserted by byte count, the way 15-git-credential-helper.test.sh does, because
# "it printed nothing important" is not a thing a test can tell.
check "it says nothing on the healthy path" "0" "$(printf '%s' "$out" | wc -c | tr -d ' ')"
check "INITIALIZATION.md does not travel" "absent" \
    "$([ -e "$tmp/ok/target/INITIALIZATION.md" ] && echo present || echo absent)"

# --- the refusal that matters
setup nomount
: > "$tmp/nomount/mounts"          # the target is not a mount of its own
out="$(run nomount || true)"
check "it refuses when the target is not its own mount" "refused" \
    "$(printf '%s' "$out" | grep -qiE 'not a mount|mount of its own' && echo refused || echo "wrote anyway")"
check "and it wrote nothing" "0" "$(ls "$tmp/nomount/target" | wc -l | tr -d ' ')"
check "and the refusal names the path" "named" \
    "$(printf '%s' "$out" | grep -qF "$tmp/nomount/target" && echo named || echo silent)"

# --- the source missing: a mis-composed image, not a project's problem
setup nosrc
rm -rf "$tmp/nosrc/src"
out="$(run nosrc || true)"
check "it refuses when the documents are not in the image" "refused" \
    "$(printf '%s' "$out" | grep -qiE 'not in the image|no such|missing' && echo refused || echo "silent")"
check "and says the image is incomplete rather than the project" "image" \
    "$(printf '%s' "$out" | grep -qiE 'image' && echo image || echo "blamed the project")"

# --- a retired document does not linger
setup retired
printf '# a rule somebody deleted upstream\n' > "$tmp/retired/target/RETIRED.md"
run retired >/dev/null
check "a document the image no longer carries is gone" "absent" \
    "$([ -e "$tmp/retired/target/RETIRED.md" ] && echo present || echo absent)"

echo
echo "50-agent-rules.test: $pass passed, $fail failed."
[ "$fail" -eq 0 ]
