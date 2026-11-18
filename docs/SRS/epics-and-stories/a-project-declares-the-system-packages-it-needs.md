# Epic: a project declares the system packages it needs

**A project lists in its manifest the Debian packages it needs, and every build installs them into its
image.**

Agreed on 2026-10-15. chip8 needed SDL2; the agent cannot `apt-get` inside the container, which is by
design, so the operator ran `docker exec` as root and lost it on every rebuild. A list in the manifest
was chosen over a project Dockerfile fragment, which would run anything as root at build and could
widen the agent's sandbox from a repository, and over `sudo apt-get` in the container, a path to
root for the agent. The epic closes when a listed package survives a rebuild and nothing but a
package name from the manifest reaches the Dockerfile.

| # | Story | Why in that order |
|---|---|---|
| 1 | the manifest lists packages and the build installs them | no FR yet — the composer reads and validates the list; Configure keeps it |
