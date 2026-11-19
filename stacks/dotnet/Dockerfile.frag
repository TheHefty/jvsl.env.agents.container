# Installs the .NET {{VERSION}} SDK from Microsoft's own apt feed — no
# distribution carries per-version .NET SDK packages in its own archive.
#
# **The config package follows the base rather than being hardcoded.** It used
# to be `config/ubuntu/24.04/packages-microsoft-prod.deb`, which is an
# Ubuntu-specific artefact: on a Debian base `dpkg -i` would have been handed
# whatever a 404 returns. `ID` and `VERSION_ID` from /etc/os-release give
# `debian/13` and `ubuntu/24.04` respectively, and Microsoft publishes both —
# measured, along with `dotnet-sdk-8.0`, `9.0` and `10.0` being present in
# `debian/13/prod`.
#
# This was the third Ubuntu-only source in the stacks, after the php and python
# PPAs. It is not a PPA, which is why the guard written for those two did not
# see it: that test looked for `launchpad` while the story it belonged to
# claimed something broader. The guard is wider now.
#
# **A failure to fetch it says which failure it was** — debt z1k. Every curl
# failure used to print "Microsoft publishes no apt config", and on 2026-11-18
# a 429 did, in CI. feed-config.sh retries, and only a 404 means the
# distribution is not covered; a 429, a 5xx or no connection says the feed
# refused or failed. The URL stays here, where no-ubuntu-only-sources reads it.
COPY stacks/dotnet/feed-config.sh /tmp/dotnet-feed-config.sh
RUN . /etc/os-release \
    && bash /tmp/dotnet-feed-config.sh \
         "https://packages.microsoft.com/config/${ID}/${VERSION_ID}/packages-microsoft-prod.deb" \
         /tmp/packages-microsoft-prod.deb "${ID} ${VERSION_ID}" \
    && rm /tmp/dotnet-feed-config.sh \
    && dpkg -i /tmp/packages-microsoft-prod.deb \
    && rm /tmp/packages-microsoft-prod.deb \
    && apt-get update && apt-get install -y --no-install-recommends \
    dotnet-sdk-{{VERSION}} \
    && rm -rf /var/lib/apt/lists/*
