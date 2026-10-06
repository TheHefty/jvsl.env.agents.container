# A stand-in for the real image, carrying only what booted.test.sh asserts.
# See entrypoint.sh for what it emulates and what it deliberately does not.
FROM alpine:3.21
RUN apk add --no-cache bash coreutils jq su-exec \
    && adduser -D -s /bin/bash abc \
    && mkdir -p /config /custom-cont-init.d \
    && chown abc:abc /config
COPY core/cont-init/10-state-ownership.sh /custom-cont-init.d/10-state-ownership.sh
COPY core/cont-init/45-agent-state-dirs.sh /custom-cont-init.d/45-agent-state-dirs.sh
COPY core/cont-init/45-beads.sh /custom-cont-init.d/45-beads.sh
COPY core/booted.test.fixture/entrypoint.sh /entrypoint.sh
# A stand-in bd that does the one thing the hook asks of it. The assertion in
# booted.test.sh is about the *hook* — that it ran, and as abc — not about what
# bd does with a database, which is the tool's own business.
RUN printf '#!/bin/sh\nmkdir -p .beads\n' > /usr/local/bin/bd \
    && chmod +x /usr/local/bin/bd

# **And s6-setuidgid, which must really drop privileges here.** The base image
# provides it; this stand-in does not, and the first hook it carries that uses
# one would otherwise die under `set -e` with the harness reporting only that a
# directory is missing. `su-exec` takes the same shape — user first, then the
# command — so the shim is one line.
#
# Executing as root instead would be worse than absent: booted.test.sh asserts
# the tracker belongs to abc, and a shim that did not drop would make that
# assertion pass against a hook that never dropped either.
RUN printf '#!/bin/sh\nexec su-exec "$@"\n' > /usr/local/bin/s6-setuidgid \
    && chmod +x /usr/local/bin/s6-setuidgid
RUN chmod +x /custom-cont-init.d/10-state-ownership.sh \
        /custom-cont-init.d/45-agent-state-dirs.sh \
        /custom-cont-init.d/45-beads.sh /entrypoint.sh
LABEL devcontainer.metadata='[{"remoteUser":"abc"}]'
ENTRYPOINT ["/entrypoint.sh"]
