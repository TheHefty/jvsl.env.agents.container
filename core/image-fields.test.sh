#!/usr/bin/env bash
# The name= fields the image test prints are its assertions' names: dfield and
# pfield read them back with a first-match sed, so a second check reusing a
# name asserts the wrong value silently — and had the values happened to fall
# the same way, it would assert the wrong thing while passing.
#
# This runs on the host and needs no docker, which is the point: the collision
# from #6d4 was caught nowhere, and only a duplicate printed inside one docker
# run could have been. It reads the printf name= lines statically and fails
# naming the duplicated field.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="${1:-$HERE/image.test.sh}"

fail() { echo "image-fields.test: FAIL: $*" >&2; exit 1; }
check() {
    if [ "$2" = "$3" ]; then
        echo "ok   $1"
    else
        echo "FAIL $1"
        echo "     expected: $3"
        echo "     got:      $2"
        exit 1
    fi
}

[ -f "$SOURCE" ] || fail "no such file: $SOURCE"

# The literal argument of a printf that prints a name= line, as it is in the
# source — so a parametrised loop name (lang_%s, match_%s) is one name, the
# same way every iteration of its loop prints it.
fields="$(grep -oE '"[A-Za-z_][A-Za-z0-9_]*(%[sab0-9.{}]*)?=' "$SOURCE" | sort)"
dups="$(printf '%s\n' "$fields" | uniq -d)"
[ -z "$dups" ] || fail "the image test prints these field names more than once: $(printf '%s' "$dups" | paste -sd' ' -). \
First-match read-back takes the first, so the second check asserts nothing."

# And a printed field has a reader: every name dfield or pfield reads exists
# among the printed fields — a name read twice returns the first match, and a
# name read that is not printed returns an empty string, asserting the
# nothing that reads as a pass.
for reader in dfield pfield; do
    for name in $(grep -oE "$reader [A-Za-z_][A-Za-z0-9_]*" "$SOURCE" | awk '{print $2}' | sort -u); do
        printf '%s\n' "$fields" | grep -qxF "\"$name=" || \
            fail "$reader $name reads a field the image test never prints, so its assertion reads an empty string"
    done
done
check "every field name the image test prints is unique, and every name read is printed" "0" "0"

# And the regression scenario, against a copy: a new check reusing a field
# name makes the guard fail, naming it. The guard is run as a command so the
# copy's shebang and directory do not matter.
scratch="$(mktemp -d)"; trap 'rm -rf "$scratch"' EXIT
sed 's/printf "reaper=%s\\n"/printf "reaper=%s\\n"; printf "reaper=%s\\n"/' "$SOURCE" > "$scratch/copy"
out="$(bash "$HERE/image-fields.test.sh" "$scratch/copy" 2>&1 || true)"
case "$out" in
    *"reaper"*) check "a duplicate field name is named" "named" "named" ;;
    *) check "a duplicate field name is named" "$(printf '%s' "$out" | head -1 | cut -c1-60)" "names reaper" ;;
esac

echo "image-fields.test: every name= field of an image test is unique, and every field read is printed."
