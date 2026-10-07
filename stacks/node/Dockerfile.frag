# Installs Node.js {{VERSION}} (NodeSource), replacing the core's own Node.js
# 22 (installed only to bootstrap the Claude Code CLI) with the version
# selected for the monorepo's own code. Needs an explicit version pin +
# `--allow-downgrades`: NodeSource's repo priority (600) isn't high enough
# for apt to treat it as a downgrade candidate over an already-installed
# newer version (APT only auto-downgrades above priority 1000), so
# `apt-cache policy`'s own "Candidate:" line still reports the core's Node
# 22 here — pulling the version from `apt-cache madison`'s nodesource entry
# instead is what actually reflects the repo just configured above.
#
# The source is written by hand rather than by nodesource's setup script piped
# into bash: core already carries the vendored key and the pin, so selecting a
# version is one line of the source.
RUN printf 'Types: deb\nURIs: https://deb.nodesource.com/node_{{VERSION}}.x\nSuites: nodistro\nComponents: main\nArchitectures: %s\nSigned-By: /usr/share/keyrings/nodesource.asc\n' \
        "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/nodesource.sources \
    && apt-get update \
    && NODE_PKG_VERSION="$(apt-cache madison nodejs | awk -F'|' '/nodesource/ {gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2; exit}')" \
    && apt-get install -y --allow-downgrades "nodejs=$NODE_PKG_VERSION" \
    && rm -rf /var/lib/apt/lists/*
