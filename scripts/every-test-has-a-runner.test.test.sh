#!/usr/bin/env bash
# The guard beside this file decides whether other checks are trusted, so
# nothing else covers its own correctness. **Its failure mode is passing when
# it should fail**, and running it in CI reveals exactly nothing about that.
#
# Same shape as changed-scope.test.sh and ci-green.test.sh, for the same
# reason: a script that gates other scripts needs a script gating it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD="$HERE/every-test-has-a-runner.test.sh"
pass=0
fail=0

check() {
    local name="$1" want="$2" workflow="$3" list="$4" min="${5:-1}"
    local out status
    set +e
    out="$(MIN_TESTS="$min" bash "$GUARD" "$workflow" "$list" 2>&1)"
    status=$?
    set -e
    if [ "$want" = pass ] && [ "$status" -eq 0 ]; then
        echo "ok      $name"
        pass=$((pass + 1))
    elif [ "$want" = fail ] && [ "$status" -ne 0 ] && printf '%s' "$out" | grep -q 'every-test-has-a-runner:'; then
        echo "ok      $name"
        pass=$((pass + 1))
    else
        echo "NOT OK  $name — wanted to $want, exited $status" >&2
        printf '%s\n' "$out" | sed 's/^/        /' >&2
        fail=$((fail + 1))
    fi
}

# **A non-existent guard makes every "expect a refusal" case pass**, because
# bash exits non-zero for a missing file too. Four of the six did exactly that
# on the first run of this file. So existence is asserted before anything else,
# and a refusal has to be a refusal *in words* — a crash produces no output and
# no longer counts.
if [ ! -x "$GUARD" ]; then
    echo "every-test-has-a-runner.test.test: FAIL: $GUARD is missing or not executable. Every \
check below would then pass for the wrong reason: a refusal and an absent file both exit \
non-zero." >&2
    exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/literal.yml" <<'YML'
jobs:
  a:
    steps:
      - run: bash scripts/one.test.sh
YML
cat > "$tmp/matrix.yml" <<'YML'
jobs:
  a:
    strategy:
      matrix:
        stack: [php, python]
    steps:
      - run: bash stacks/${{ matrix.stack }}/image.test.sh
YML
printf 'scripts/one.test.sh\n' > "$tmp/one"
printf 'scripts/one.test.sh\nscripts/two.test.sh\n' > "$tmp/two"
printf 'stacks/php/image.test.sh\nstacks/python/image.test.sh\n' > "$tmp/stacks"

check "a path named literally counts as having a runner"        pass "$tmp/literal.yml" "$tmp/one"
check "a file with no runner anywhere fails"                    fail "$tmp/literal.yml" "$tmp/two"
check "a path reached through a matrix variable counts"          pass "$tmp/matrix.yml"  "$tmp/stacks"

# The scenario that matters most, because it is the one that would make every
# other check here worthless while reporting success.
check "an empty list refuses instead of passing vacuously"      fail "$tmp/literal.yml" /dev/null 20
check "a list shorter than the floor refuses"                    fail "$tmp/literal.yml" "$tmp/one" 20

# A workflow that cannot be read is not a workflow with no runners in it.
check "a missing workflow refuses rather than reporting none"    fail "$tmp/does-not-exist.yml" "$tmp/one"

echo
echo "every-test-has-a-runner.test.test: $pass passed, $fail failed."
[ "$fail" -eq 0 ]
