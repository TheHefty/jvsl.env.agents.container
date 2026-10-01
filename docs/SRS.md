# Software Requirements Specification

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-10-01 |
| **Author** | João Lima |

What this system must do, agreed before any story is written. The purpose and the scope boundary
are [the charter](CHARTER.md) and are not restated here.

A note on where things live, because this project is built across two repositories: the extension
is this one, and every change to the container image is the template's
(`jvsl.env.agents.code-server`). Requirements below are written about the **system the user
experiences**, which is both halves together. The epic section says which repository each story
lands in.

## Functional requirements

### Opening a project (FR-1x)

- **FR-11** — Opening a project that carries `.code-server/` connects the host's editor to that
  project's container, with the workspace at `/config/workspace`.
- **FR-12** — The session inside the container runs as `abc`, never as `root`, from the first
  connection onward. No state directory the editor creates (`/config/.vscode-server`,
  `/config/.gnupg`) is left owned by another user.
- **FR-13** — The container is created with the CPU, memory and swap limits the project's
  `.code-server.stack.json` declares, and with the defaults the launcher used when the manifest is
  silent.
- **FR-14** — The CPU limit is expressed as affinity, not as a quota, so that tooling reading the
  CPU count inside the container observes the limit rather than oversubscribing against it.
- **FR-15** — A device is passed through only when the host actually has it. A host without
  `/dev/kvm`, `/dev/fuse` or `/dev/net/tun` opens the project successfully, without that device.
- **FR-16** — The configuration handed to the container runtime is generated, never authored. It
  is regenerated on every open and is not version-controlled.
- **FR-17** — The editor's own process is not subject to the container's limits. This is the
  requirement the project exists for; see NFR-1.
- **FR-18** — code-server's port is not published unless the project's manifest asks for it.

### Refusing what cannot be opened (FR-2x)

Each refusal below names what failed, what was expected, and what to do about it. None of them
leaves the user with a window that merely does not work.

- **FR-21** — A project whose `.code-server/` submodule is not initialized is refused, naming the
  command that initializes it. This is the failure the template's own `CLAUDE.md` describes as
  silent; it must not be silent here.
- **FR-22** — A project whose template version is below the minimum this extension requires is
  refused, naming the version found, the version needed, and how to bump.
- **FR-23** — A project whose image does not exist is refused, naming the image and the command
  that builds it. The extension does not build images.
- **FR-24** — A host where the container runtime is not reachable is refused, saying so, rather
  than failing somewhere later with a message about something else.
- **FR-25** — Installing on an editor build that cannot use the container tooling fails at install
  time rather than degrading silently at run time.

### Isolation across the boundary (FR-3x)

- **FR-31** — No ssh-agent, gpg-agent or X11 socket from the host is reachable inside the
  container.
- **FR-32** — The host's git credential helper and the host's `gitconfig` do not reach the
  container. Inside it, GitHub authentication is the container's own.
- **FR-33** — Workspace Trust remains enabled. The extension never disables it, for any project.
- **FR-34** — `.vscode/` is not writable by an agent running inside the sandbox, so that a task
  configured to run on folder open cannot be planted from inside the jail and executed outside it.
  Widening this is an explicit, per-case grant.
- **FR-35** — Enforcement does not depend on a host-wide editor setting alone: anything the
  generated configuration cannot express is also refused from inside the container, so that a
  setting changed for another project does not reopen the hole here.

### The remote editor arrives equipped (FR-4x)

- **FR-41** — Opening a project gives the remote editor the extensions and settings the image
  already associates with that project's stacks, without the project listing anything.
- **FR-42** — That association is declared by the image, so adding a stack to the template adds its
  extension without any change here.
- **FR-43** — An extension that cannot be resolved does not prevent the project from opening.

### Retiring the launcher (FR-5x)

- **FR-51** — The existing launcher keeps working and says, on every run, that it is deprecated and
  where to migrate.
- **FR-52** — It is removed in the following major version, not before.

## Non-functional requirements

- **NFR-1 — Resource isolation.** The editor process is never subject to the container's `cpuset`
  or memory limit. Checkable by inspecting the editor process's cgroup, deterministically, on any
  host. This is stated as isolation rather than as a time budget on purpose: the defect being
  fixed was contention, not slow startup, and a seconds-to-editable threshold either passes
  everywhere or fails in CI for reasons that have nothing to do with the system.
- **NFR-2 — Observability.** The extension writes to a dedicated output channel, recording
  decisions and their inputs — the cpuset it chose and the host core count behind it, the devices
  it omitted and why, the template version it read — and never the control flow. Anything that
  blocks opening is surfaced as a notification carrying the action that resolves it.
- **NFR-3 — Accessibility.** The user-facing surface is native editor components — notifications,
  quick picks, the output channel — so accessibility is the editor's. The commitment this makes
  concrete: no webview in the first release. A later screen carries its own accessibility cost
  rather than inheriting one for free.
- **NFR-4 — Internationalization.** English only, with no localization mechanism. The audience is
  projects that adopted the template, whose documentation language is English.
- **NFR-5 — Operability.** The extension runs on the host and holds no state of its own beyond
  what it writes into the project it is opening. Removing it leaves the project openable by the
  tooling it delegates to.

## Data and legal

**No personal data is processed.** The extension runs entirely on the user's machine, collects
nothing, transmits nothing, and has no telemetry and no server component. There is no controller,
no legal basis to record and no retention period, because there is no processing.

Two things it *reads* are worth naming so the record is complete rather than merely short: the
project's own files on disk, and the host's hardware characteristics (core count, presence of
device nodes). Neither leaves the machine, and neither is written anywhere but into the generated
configuration and the output channel.

Adding telemetry would turn this section into a data map and is named in the charter as a change
that requires re-grilling it.

## Epics and stories

### Epic: the host editor replaces the launcher

**Opening a project in the host's editor becomes how the work is done, and `start` is retired.**

The epic closes when opening through the extension is the normal path and `start` says where to
migrate. Removal in the following major is a scheduled consequence, not outstanding work.

**Before the first story: a throwaway spike** (template repo). One container brought up against a
hand-written configuration, to answer four questions the stories below are otherwise grilled
against guesses: whether an empty `PASSWORD` disables code-server's authentication; whether the
image metadata label is honoured on this path and which side wins the merge; whether agent sockets
are forwarded on this path, and which keys disable each; and which extension identifiers diverge
between the two registries. The spike is discarded; its answers are written back into this
document.

Stories, in order. "Repo" says where the pull requests land; a story spanning both is one story,
because it is one behaviour.

| # | Story | Repo |
|---|---|---|
| 1 | **Opening a configured project** — the editor connects as `abc` at `/config/workspace`, with the manifest's limits, the host's actual devices, and no state left owned by root. | both |
| 2 | **Refusing what cannot be opened** — uninitialized submodule, template below minimum, missing image, unreachable runtime; each naming its cause and its fix. | extension |
| 3 | **Host secrets stay on the host** — no agent sockets, no host credential helper, no host gitconfig; Workspace Trust untouched; `.vscode/` not writable from inside the jail. | both |
| 4 | **The remote editor arrives equipped** — stack extensions and settings declared by the image. | template |
| 5 | **The launcher announces its retirement** — deprecation notice naming the migration. | template |

Story 1 begins in the template, because the extension cannot connect as `abc` while the user's
shell is `/bin/false` and no remote user is declared. Its extension half follows the tag that
carries the image half, which is also what gives the minimum template version a real value instead
of a placeholder.

### Epics named but not decomposed

Named so the first release does not close the door on them. None is scheduled, and none has
stories until it is grilled.

- **Starting a new project** — the initialization interview, conducted inside the project's own
  container as its first session.
- **Adopting the template into an existing project** — stack detection by heuristic on the host,
  confirmed by the user, before any agent exists to ask.
- **The agents screen** — connecting an agent once, renewing on request, and where each agent's
  credentials live.
- **Absorbing stack selection** — the image composition that `.code-server/setup` performs today,
  reachable from the editor. The first release must leave that logic invocable rather than only
  interactive.

## Alternatives considered

- **The extension runs the container itself and attaches to the result.** Rejected: it would own
  the whole lifecycle — stopped containers, stale images, reconnection after a window reload —
  that the tooling it delegates to already handles, and attach is the path on which every
  isolation defect in manual testing appeared.
- **Generating the dynamic configuration from a host hook at startup.** Rejected: the hook runs
  after the configuration has been read, and its ordering against the runtime commands is
  unspecified, with open upstream bugs. The extension computes everything before handing over.
- **Keeping the existing launcher as a permanent fallback.** Rejected: two implementations of the
  same decisions about CPU affinity and devices, diverging silently. code-server stays in the
  image as the fallback instead, and the launcher goes.
- **One repository for the extension and the image.** Rejected: the image has CI that builds
  images and this does not, and merging them would put the extension's code in a repository whose
  release train is about something else.
- **An agent on the host for the flows where no container exists yet.** Rejected: it would ship
  "an unsandboxed agent on the host" as a feature of a project whose purpose is to keep isolation
  intact while moving the editor out.
- **Doing nothing.** Rejected: the defect is measured and reproducible, and the manual workaround
  — attaching by hand — leaves the user as root, with host agent sockets forwarded.

## Outcome

Accepted by João Lima on 2026-10-01, from the grilling that produced it.

What the grilling changed, against what went in:

- **The headline requirement stopped being a stopwatch.** The obvious reading of "the editor
  froze" is a time budget, and it was rejected: the defect was contention, so the requirement is
  that the editor process is never subject to the container's `cpuset` or memory limit, checkable
  by reading a cgroup on any host. A seconds-to-editable threshold either passes everywhere or
  fails in CI for reasons unrelated to the system.
- **Stories are not split along the repository boundary.** Two of the five span both repositories.
  Splitting them would have produced halves nobody can demonstrate, which is the thing a story is
  defined against; the repository is recorded as a marker instead.
- **One story count was reconciled at the gate.** Five stories were settled by behaviour, and a
  later option text listed six by separating "connecting as `abc`" from isolation. Resolved to
  five: connecting as `abc` is what makes opening mean anything, not a behaviour of its own.
- **A bug found during the same testing was kept out of the epic.** `AI_MEMORY_DATA_DIR` and
  `AI_MEMORY_BACKUP_DIR` not surviving the sandbox's `--clearenv` is real and unrelated; it
  becomes its own fix in the template, reproduction first, rather than a sixth story that would
  make the epic's sentence need another "and".
- **The spike moved in front of the stories.** It was going to be a task inside each story that
  needed it; three of the four questions fall out of one experiment, and the image stories cannot
  be grilled without their answers.

The sections above are as written at the gate and were not edited afterwards.
