#!/usr/bin/env bash
# Every CI job that builds an image logs in to ghcr.io before it pulls (debt
# ci-image-builds-pull-the-base-image-anonymously-and-hit-ghcr-rate-limits,
# task dm5.1). The base image is ghcr.io/linuxserver/baseimage-debian, and
# anonymous pulls have a far lower limit than authenticated ones: with several
# PRs in CI at once, stack-build's eleven parallel pulls got 429 Too Many
# Requests (run 41776574299, 2026-11-04), failing builds for a registry's
# reason, not the change's.
#
# The ways it fails, checked per job in .github/workflows/ci.yml:
#   1. a job that runs `docker build` with no ghcr.io login before it — a new
#      job, or a step moved above the login — or without packages: read;
#   2. the token where it can leak: on a command line (-p, --password), rather
#      than on --password-stdin from an environment variable;
#   3. a failed login failing the build — a fork's token may not read
#      packages, and its PR would go red for the registry's reason.
#
# CI_YML points this at another file, which is how each shape was first seen
# to fail it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_YML="${CI_YML:-$HERE/../.github/workflows/ci.yml}"

python3 -I - "$CI_YML" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
body = text.split('\njobs:\n', 1)[1]
jobs = re.split(r'\n(?=  [A-Za-z0-9_-]+:\n)', '\n' + body)
failures = []
builders = 0
for job in jobs:
    m = re.match(r'\n?  ([A-Za-z0-9_-]+):\n', job)
    if not m:
        continue
    name = m.group(1)
    lines = [l for l in job.split('\n') if not l.strip().startswith('#')]
    code = '\n'.join(lines)
    build = code.find('docker build')
    if build == -1:
        continue
    builders += 1
    login = code.find('docker login ghcr.io')
    if login == -1 or login > build:
        failures.append(f'1: {name} runs docker build with no ghcr.io login before it, so its pull of the base image is anonymous')
        continue
    if not re.search(r'\n {4}permissions:\n(?: {6}.*\n)*? {6}packages: read', code + '\n'):
        failures.append(f'1: {name} logs in but does not grant packages: read, so the token cannot read the registry')
    line = code[login:code.find('\n', login)]
    if '--password-stdin' not in line:
        failures.append(f'2: {name} logs in without --password-stdin; the token must come on stdin, never on a command line')
    after = code[login:login + 400]
    if '::warning::' not in after or '||' not in after:
        failures.append(f'3: {name}: a failed login would fail the build; it must warn and let the build go on anonymously')
for m in re.finditer(r'docker login[^\n]*', text):
    if re.search(r'\s(-p|--password)(\s|=)', m.group(0)):
        failures.append(f'2: a docker login passes the password on its command line: {m.group(0).strip()}')
if builders < 3:
    failures.append(f'found {builders} job(s) running docker build in {sys.argv[1]}; expected at least 3 (core-build, core-booted, stack-build) — this check is not reading the file it thinks it is')
for f in failures:
    print('FAIL ' + f)
if failures:
    print(f'ci-image-pulls-are-authenticated.test: {len(failures)} failure(s)')
    sys.exit(1)
print(f'ci-image-pulls-are-authenticated.test: all {builders} image-building jobs log in to ghcr.io first, with the token on stdin, and a failed login only warns.')
PY
