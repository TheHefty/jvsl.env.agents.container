# Installs Ruby {{VERSION}}, built from source via ruby-build — no actively
# maintained PPA covers multi-version Ruby on current Ubuntu releases
# (brightbox/ruby-ng's last published dist is 'zesty', ~2017). rustc, needed
# to build YJIT, is already provided by core/.
#
# **ruby-build from a pinned release, checked**, not `git clone` of whatever
# master was that day: the clone ran unreviewed code that compiles the
# interpreter. v20260924 defines 3.2.9, 3.3.9 and 3.4.9 (measured on
# 2026-10-07). A version it does not define fails before any compile, naming
# the pin to bump.
ARG RUBY_BUILD_TAG=v20260924
ARG RUBY_BUILD_SHA256=cbdd65281cbf2b81d963545533ea8ea6110e089bc5a92c281f0e076fde2dee0d
RUN apt-get update && apt-get install -y --no-install-recommends \
    autoconf \
    patch \
    libssl-dev \
    libyaml-dev \
    libreadline-dev \
    zlib1g-dev \
    libncurses-dev \
    libffi-dev \
    libgdbm-dev \
    uuid-dev \
    libgmp-dev \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fL --no-progress-meter --proto '=https' --tlsv1.2 --retry 5 --retry-all-errors \
         -o /tmp/ruby-build.tar.gz \
         "https://github.com/rbenv/ruby-build/archive/refs/tags/${RUBY_BUILD_TAG}.tar.gz" \
    && echo "${RUBY_BUILD_SHA256}  /tmp/ruby-build.tar.gz" | sha256sum -c - \
    && mkdir -p /tmp/ruby-build && tar -xzf /tmp/ruby-build.tar.gz -C /tmp/ruby-build --strip-components=1 \
    && { [ -f "/tmp/ruby-build/share/ruby-build/{{VERSION}}" ] \
         || { echo "ruby-build ${RUBY_BUILD_TAG} has no definition for Ruby {{VERSION}}. Bump RUBY_BUILD_TAG and RUBY_BUILD_SHA256 in stacks/ruby/Dockerfile.frag to a release that has it." >&2; exit 1; }; } \
    && /tmp/ruby-build/bin/ruby-build {{VERSION}} /usr/local \
    && rm -rf /tmp/ruby-build /tmp/ruby-build.tar.gz
