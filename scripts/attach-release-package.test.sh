#!/usr/bin/env bash
# scripts/attach-release-package.sh, driven against stand-ins for gh.
#
# Story the-release-workflow-attaches-the-package. On 2026-10-09 v1.0.0 was cut
# with no package, and attaching one by hand first picked up another run's
# artifact: a 0.3.0 package, caught only because its version was read before
# uploading. These are the three ways this step fails worst:
#
#   1. the wrong package is attached;
#   2. the release ends with no package and the workflow stays green;
#   3. a re-run duplicates the asset or fails on it.
#
# The gh stand-in keeps the release's assets in a directory, reports each with
# the sha256 GitHub records as its digest, and can be told to fail an upload or
# to lose one, which is what a read-back exists to catch.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/attach-release-package.sh"

failures=0
check() {
    if [ "$2" = "$3" ]; then echo "ok   $1"; else
        echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; failures=$((failures + 1)); fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/assets"
export ASSETS="$work/assets"

cat > "$work/bin/gh" <<'SH'
#!/usr/bin/env bash
# gh release upload <tag> <file> [--clobber] | gh release view <tag> --json assets
case "$1 $2" in
    "release upload")
        [ -n "${GH_FAIL_UPLOAD:-}" ] && { echo "HTTP 502: upload failed" >&2; exit 1; }
        file="$4"; name="$(basename "$file")"
        if [ -e "$ASSETS/$name" ] && [[ " $* " != *" --clobber "* ]]; then
            echo "asset under the same name already exists: [$name]" >&2; exit 1
        fi
        [ -n "${GH_LOSE_UPLOAD:-}" ] || cp "$file" "$ASSETS/$name"
        ;;
    "release view")
        printf '{"assets":['
        sep=''
        for f in "$ASSETS"/*; do
            [ -e "$f" ] || continue
            printf '%s{"name":"%s","digest":"sha256:%s"}' "$sep" "$(basename "$f")" "$(sha256sum "$f" | cut -d' ' -f1)"
            sep=','
        done
        printf ']}\n'
        ;;
    *) echo "gh stand-in: unsupported: $*" >&2; exit 2 ;;
esac
SH
chmod +x "$work/bin/gh"

# A package is a zip whose extension/package.json names a version.
package() {
    rm -rf "$work/pkg" && mkdir -p "$work/pkg/extension"
    printf '{"name":"jvsl-env-agents-container","version":"%s","build":"%s"}\n' "$1" "${2:-a}" > "$work/pkg/extension/package.json"
    (cd "$work/pkg" && rm -f "$work/p.vsix" && zip -q -r "$work/p.vsix" extension)
}

attach() {
    set +e
    PATH="$work/bin:$PATH" bash "$SCRIPT" "$1" "$work/p.vsix" > "$work/out" 2>&1
    echo $? > "$work/rc"
    set -e
}
asset_count() { find "$ASSETS" -type f | wc -l | tr -d ' '; }

# --- 1. the wrong package is never attached ----------------------------------

package 0.3.0
attach v1.0.0
check "a 0.3.0 package for v1.0.0 is refused" "$(cat "$work/rc")" "1"
check "naming both versions" "$(grep -c '0.3.0.*v1.0.0\|v1.0.0.*0.3.0' "$work/out" || true)" "1"
check "and nothing is uploaded" "$(asset_count)" "0"

# --- the right one is, under its version's name -------------------------------

package 1.0.0
attach v1.0.0
check "a 1.0.0 package for v1.0.0 is attached" "$(cat "$work/rc")" "0"
check "as jvsl-env-agents-container-1.0.0.vsix" "$(ls "$ASSETS")" "jvsl-env-agents-container-1.0.0.vsix"
check "byte for byte" "$(sha256sum < "$ASSETS/jvsl-env-agents-container-1.0.0.vsix" | cut -d' ' -f1)" "$(sha256sum < "$work/p.vsix" | cut -d' ' -f1)"

# --- 2. no package is never green ----------------------------------------------

rm -f "$ASSETS"/*
GH_FAIL_UPLOAD=1 attach v1.0.0
check "an upload that fails fails the step" "$(cat "$work/rc")" "1"
check "naming the upload" "$(grep -c 'attach-release-package: the upload failed' "$work/out" || true)" "1"

GH_LOSE_UPLOAD=1 attach v1.0.0
check "an upload the release does not show afterwards fails the step" "$(cat "$work/rc")" "1"
check "naming the read-back" "$(grep -c 'not on the release' "$work/out" || true)" "1"

set +e; PATH="$work/bin:$PATH" bash "$SCRIPT" v1.0.0 "$work/no-such.vsix" > "$work/out" 2>&1; rc=$?; set -e
check "a missing package fails, naming it" "$rc $(grep -c 'no-such.vsix' "$work/out" || true)" "1 1"

# --- 3. a re-run replaces, never duplicates ------------------------------------

rm -f "$ASSETS"/*
package 1.0.0 first
attach v1.0.0
package 1.0.0 second
attach v1.0.0
check "a second run over an existing asset succeeds" "$(cat "$work/rc")" "0"
check "and leaves one asset" "$(asset_count)" "1"
check "which is the new package" "$(sha256sum < "$ASSETS/jvsl-env-agents-container-1.0.0.vsix" | cut -d' ' -f1)" "$(sha256sum < "$work/p.vsix" | cut -d' ' -f1)"

# --- the workflow that calls it -------------------------------------------------
#
# A trigger cannot be run here. What can be checked is that the workflow fires on
# a published release and runs this script, from the tag, with write access only
# where it uploads.

wf="$HERE/../.github/workflows/release-package.yml"
check "release-package.yml exists" "$([ -f "$wf" ] && echo yes || echo no)" "yes"
if [ -f "$wf" ]; then
    check "it fires on a published release" "$(grep -cE '^\s+types:\s*\[\s*published\s*\]' "$wf" || true)" "1"
    check "it builds from the release's tag" "$(grep -c 'ref: \${{ github.event.release.tag_name }}' "$wf" || true)" "1"
    check "and runs this script with that tag" "$(grep -c 'scripts/attach-release-package.sh "\${{ github.event.release.tag_name }}"' "$wf" || true)" "1"
fi

echo
if [ "$failures" -eq 0 ]; then
    echo "attach-release-package.test: all checks passed."
else
    echo "attach-release-package.test: $failures failed." >&2
    exit 1
fi
