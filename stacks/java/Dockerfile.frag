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
