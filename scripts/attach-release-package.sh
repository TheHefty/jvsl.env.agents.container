#!/usr/bin/env bash
# Attaches a built .vsix to a published release, and proves it is there.
#
#   attach-release-package.sh <tag> [package]   package defaults to jvsl-env-agents-container.vsix
#
# Story the-release-workflow-attaches-the-package; run by
# .github/workflows/release-package.yml when a release is published.
#
# **The package's own version is checked against the tag before anything is
# uploaded.** On 2026-10-09 the manual attach for v1.0.0 first picked up another
# run's artifact, a 0.3.0 package, and only reading its version caught it.
#
# **It reads the release back** and fails unless the asset is there with the
# uploaded file's sha256: an upload that reported success and left nothing would
# otherwise end the workflow green on a release with nothing to install.
# `--clobber` makes a re-run replace the asset rather than fail on it.
set -euo pipefail

say() { echo "attach-release-package: $*"; }
refuse() { echo "attach-release-package: $*" >&2; exit 1; }

tag="${1:?usage: attach-release-package.sh <tag> [package]}"
package="${2:-jvsl-env-agents-container.vsix}"

[ -f "$package" ] || refuse "no package at $package, so there is nothing to attach to $tag. Run npm run package first."

expected="${tag#v}"
version="$(unzip -p "$package" extension/package.json 2>/dev/null | jq -r '.version // empty' 2>/dev/null || true)"
[ -n "$version" ] || refuse "$package has no extension/package.json with a version; it is not this extension's package."
[ "$version" = "$expected" ] \
    || refuse "$package is version $version, and the release is $tag: refusing to attach the wrong package. Nothing was uploaded."

name="jvsl-env-agents-container-$version.vsix"
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
cp "$package" "$dir/$name"
sha="$(sha256sum "$dir/$name" | cut -d' ' -f1)"

say "attaching $name (sha256 $sha) to $tag"
gh release upload "$tag" "$dir/$name" --clobber \
    || refuse "the upload failed (above), so $tag has no package. Re-run this workflow; --clobber makes that safe."

digest="$(gh release view "$tag" --json assets | jq -r --arg n "$name" '.assets[] | select(.name == $n) | .digest')"
[ "$digest" = "sha256:$sha" ] \
    || refuse "$name is not on the release with the uploaded digest (found: ${digest:-nothing}). The upload reported success; $tag has no package to install."

say "$tag carries $name, sha256 $sha"
