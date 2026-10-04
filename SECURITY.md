# Security Policy

## Supported versions

Only the most recent release. Fixes ship as a new release rather than as patches backported to
older tags — see [`CHANGELOG.md`](CHANGELOG.md) for what has landed.

## Reporting a vulnerability

Report privately through GitHub: **Security → Report a vulnerability** on this repository. Please do
not open a public issue for something exploitable.

Include what you did, what happened, and which version — the extension's, from its listing or
`package.json`. If it involves a built image, the stacks that project selected matter, because they
decide what is in it.

## What this extension is, and what that makes it responsible for

**It runs on the host, outside any container, and it does four things that touch somebody's
machine.** That is the surface worth reviewing, and it grew when this repository stopped being only
an extension and started carrying the image's content.

| | |
|---|---|
| it writes a dev container configuration | `.devcontainer/devcontainer.json`, generated and gitignored, computed from the project's manifest and this machine's hardware |
| it builds an image | composing a Dockerfile from the `core/` and `stacks/` it ships, and running `docker build` |
| it writes two files into a project | `CLAUDE.md` and `AGENTS.md`, **only when absent** — a file it did not write is refused rather than overwritten |
| it declares the container's mounts | including one over `/config/.claude/rules` |

### What it does not do

Each of these is a thing a reader might reasonably assume, and none of them is true:

- **It collects nothing and sends nothing anywhere.** No telemetry, no analytics, no crash
  reporting. Adding any would be a change to the project's charter rather than a feature.
- **It handles no credentials.** It never reads, writes, forwards or logs a token, and the image it
  builds is built on the rule that a credential reaches an agent as a *file* and never as a
  variable — a variable is re-expanded onto the sandbox launcher's command line, where `ps` reads it
  from anywhere else in the container.
- **It forwards no agent sockets.** No ssh-agent, no gpg-agent, no X11, no host git credential
  helper, no host gitconfig. The generated configuration contains three mounts and two environment
  variables in total, and none of them is any of those.

  **Nothing asserts it, and that is a gap rather than a detail.** The failure is silent — a
  forwarded helper does not error, it makes a `push` authenticate as somebody else — so "there is
  nothing there to forward" is true by reading the code today and by nothing tomorrow. Writing this
  document is what found it.
- **It does not disable Workspace Trust**, and the image's `devcontainer.metadata` label may not
  carry a setting that would. A test holds that true.
- **It does not publish a port.** There is no editor in the container and no HTTP server; the
  arrangement this replaced served one on loopback without authentication.

### The mount over `~/.claude/rules`, which is the one to look at

The container binds this machine's own `~/.claude` so an agent's credentials and history persist.
A boot hook writes the normative documents into `rules/` inside it — and **that directory is mounted
separately, as a `tmpfs`**, so the write cannot reach the host's copy. Without that mount, one
project's rules would appear in every project on the machine.

The hook does not trust the configuration for this. It checks `/proc/mounts` itself and refuses,
naming the path, when its target is not a mount of its own: a declaration in a file the hook never
reads is not a guarantee the hook holds.

### What the container is permitted, deliberately

The image is **not** a hardened sandbox, and the project's documents say so rather than implying
otherwise. It runs with `SYS_ADMIN`, `seccomp=unconfined` and `systempaths=unconfined` because the
nested **rootless** Docker daemon needs them — and nested rootless is itself the security decision:
mounting the host's Docker socket instead would make everything in the container root-equivalent on
the host. `/dev/fuse`, `/dev/net/tun` and `/dev/kvm` are passed through only when the host has
them.

Treat a container built from this as trusted-code territory. What it protects is the **host** from
the container's workload, not the container from code somebody chose to run in it.

## Reviewing this yourself

Everything above is in the repository rather than only in this file:

- `src/devcontainer.ts` — what the generated configuration contains, and its tests
- `src/open.ts` — every refusal, as a pure function over what the host looks like
- `src/instructions.ts` — the rule that a file this extension did not write is somebody's work
- `core/Dockerfile.frag` — what is installed. **Two of its five third-party fetches verify a
  digest and three do not**, which is a recorded debt rather than an oversight: a tag can be
  repointed and its assets replaced, so an unverified fetch means the image can change under a
  project on a rebuild that changed nothing in it. That has happened once — an `ai-jail` release
  turned network access into an opt-in and the environment lost its network on the next rebuild,
  presenting as a host networking fault that did not exist.
- `core/cont-init/50-agent-rules.sh` — the mount check described above
- `docs/agent/en/RULES.md` — the ground rules the whole arrangement is built on, Security first
