#!/usr/bin/env bash
# Runs INSIDE a built ruby-stack image. Asserts that Ruby is the version the
# stack asked for.
#
# **Why this exists:** until 2026-10-07 ruby-build was cloned from whatever
# master was that day; it is now a pinned, checked release tag (the debt
# six-build-time-fetches-verify-nothing in the tracker). A pin that is too old
# for a listed version fails the build with a message naming the pin; this is
# the other half, that what was built is what was asked for.
#
# Run by .github/workflows/ci.yml's stack-build job, against the lowest listed
# version; the mount gives this file that list.
set -uo pipefail
want="$(jq -r 'sort_by(split(".") | map(tonumber)) | first' /image-test/versions.json)"
got="$(ruby -e 'print RUBY_VERSION' 2>/dev/null)"
if [ "$got" = "$want" ]; then
    echo "ok   ruby is $want"; echo "ruby image.test: all checks passed."
else
    echo "FAIL ruby is '${got:-absent}', expected $want"; echo "ruby image.test: 1 failed."; exit 1
fi
