# Installs OpenJDK {{VERSION}} from the distribution's own archive.
#
# **It offered 17 and 21 until the base became Debian trixie, which does not
# package 17.** Asked of api.ftp-master.debian.org: `openjdk-17-jdk` and
# `openjdk-24-jdk` are absent from trixie, `openjdk-21-jdk` and
# `openjdk-25-jdk` are there. So the list is 21 and 25.
#
# Moving to Adoptium would have kept 17 — `packages.adoptium.net` serves trixie
# and carries temurin-8 through temurin-27 — and was weighed against the cost: a
# second third-party repository with a key to vendor, verify and rotate, for one
# version of one stack. Taking what the distribution packages was chosen
# instead, and the capability lost is real: a project pinned to Java 17 has to
# say so itself.
#
# The android stack depends on this one, so it now builds against 21.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-{{VERSION}}-jdk \
    maven \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sfn "/usr/lib/jvm/java-{{VERSION}}-openjdk-$(dpkg --print-architecture)" /usr/lib/jvm/stack-java \
    && test -x /usr/lib/jvm/stack-java/bin/javac

# **One stable path for the selected JDK, and the editor told about it** (debt
# the-editor-imports-gradle-with-a-java-the-project-does-not-use). The Java
# language support imports Gradle with the JRE it bundles (25) whenever nothing
# names another, and Gradle 8.14 does not run on 25: "Can't use Java 25.0.4.1
# and Gradle 8.14.3". Debian's directory carries the version and the
# architecture, so the link is what this stack's devcontainer.json can name.
ENV JAVA_HOME=/usr/lib/jvm/stack-java

# **Gradle's idle daemons, bounded in time** (#187). The heaps are already
# bounded by Gradle's own defaults (-Xmx512m, inherited by the Kotlin daemon);
# what is not is how long an idle one lives — three hours, two for Kotlin, and
# two for a Kotlin daemon orphaned by an OOM-killed Gradle daemon. The file is
# the image's and read-only; the boot hook merges it at the top of the person's
# user-home gradle.properties, and core/bin/jail-common.sh maps it, and only
# it, into the agent's sandbox.
COPY stacks/java/gradle.properties /etc/jvsl/gradle.properties
COPY stacks/java/cont-init/60-gradle-defaults.sh /custom-cont-init.d/60-gradle-defaults.sh
RUN chmod 0644 /etc/jvsl/gradle.properties && chmod +x /custom-cont-init.d/60-gradle-defaults.sh

# **The reaper's Testcontainers kind** (#186). Ryuk cannot work under the nested
# rootless daemon, so nothing else removes what a dead test JVM started. The
# kind removes a Testcontainers container only when no live JVM that could own
# it started before it did; see the script for what "could own" means and what
# it never touches. core/services/svc-reaper runs it every five minutes.
COPY stacks/java/reapers/testcontainers /usr/local/lib/jvsl/reapers.d/testcontainers
RUN chmod 0755 /usr/local/lib/jvsl/reapers.d/testcontainers

# And the jvms kind: a Kotlin compile daemon once no Gradle daemon is left, and
# a Java language server once no editor is above it (#187). No other JVM.
COPY stacks/java/reapers/jvms /usr/local/lib/jvsl/reapers.d/jvms
RUN chmod 0755 /usr/local/lib/jvsl/reapers.d/jvms
