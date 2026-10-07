# Installs Go {{VERSION}} (official tarball — Ubuntu's golang-go package
# doesn't offer per-version selection)
#
# **Downloaded, checked, then unpacked**, never piped into tar: until
# 2026-10-07 the archive was unpacked straight from the network, with the
# version pinned and the bytes not. The sha256 for each version is in
# stacks/golang/digests.json, measured on the downloaded archive.
COPY stacks/golang/digests.json /tmp/go-digests.json
RUN digest="$(jq -r --arg v '{{VERSION}}' '.[$v] // empty' /tmp/go-digests.json)" \
    && { [ -n "$digest" ] \
         || { echo "golang stack: no pinned digest for Go {{VERSION}} in stacks/golang/digests.json. Download the archive, run sha256sum, and add it there." >&2; exit 1; }; } \
    && curl -fL --no-progress-meter --proto '=https' --tlsv1.2 --retry 5 --retry-all-errors \
         -o /tmp/go.tar.gz "https://go.dev/dl/go{{VERSION}}.linux-amd64.tar.gz" \
    && echo "${digest}  /tmp/go.tar.gz" | sha256sum -c - \
    && tar -C /usr/local -xzf /tmp/go.tar.gz \
    && rm -f /tmp/go.tar.gz /tmp/go-digests.json
ENV PATH=/usr/local/go/bin:$PATH
