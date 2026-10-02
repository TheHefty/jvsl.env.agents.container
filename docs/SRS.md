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

- **FR-11** — Opening a project that carries a manifest connects the host's editor to that
  project's container, with the workspace at `/config/workspace`. **Read "carries `.code-server/`"
  until the seventh amendment**, which named a submodule rather than the thing the flow needs.
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
- ~~**FR-18** — code-server's port is not published unless the project's manifest asks for it.~~
  **Satisfied absolutely and struck.** FR-71 took the editor out of the image, so there is no port
  to publish and no manifest key that could ask for one. A requirement about restraint became a
  requirement about nothing.
- **FR-19** — The generated configuration references the project's prebuilt image by name and
  never builds it. Image-declared metadata is resolved only for an image that already exists, so
  a configuration that built instead would silently lose everything FR-4x depends on.

### Refusing what cannot be opened (FR-2x)

Each refusal below names what failed, what was expected, and what to do about it. None of them
leaves the user with a window that merely does not work.

- ~~**FR-21** — A project whose `.code-server/` submodule is not initialized is refused, naming the
  command that initializes it.~~ **Struck by the seventh amendment: there is no submodule.** The
  failure it guarded was real and is simply gone — nothing can be uninitialized that is not
  vendored.
- ~~**FR-22** — A project whose template version is below the minimum this extension requires is
  refused, naming the version found, the version needed, and how to bump.~~ **Struck by the seventh
  amendment: there is no second version to disagree with.** This shipped — `version.txt`,
  `isAtLeast`, three refusal messages — hours before the charter amendment that removes its reason.
- **FR-23** — A project whose image does not exist is refused, naming the image and the command
  that builds it. ~~The extension does not build images.~~ **That last sentence was struck by the
  fifth amendment** and stayed in the text; FR-64 is the extension running the build.
- **FR-24** — A host where the container runtime is not reachable is refused, saying so, rather
  than failing somewhere later with a message about something else.
- **FR-25** — Installing on an editor build that cannot use the container tooling fails at install
  time rather than degrading silently at run time.

### Isolation across the boundary (FR-3x)

- **FR-31** — No ssh-agent, gpg-agent or X11 socket from the host is reachable **by an agent
  running in the sandbox**. Amended on 2026-10-01 from "reachable inside the container", which is
  not achievable — see the amendment in Outcome and FR-37.
- **FR-32** — The host's git credential helper and the host's `gitconfig` do not reach the
  container. Inside it, GitHub authentication is the container's own.
- **FR-33** — Workspace Trust remains enabled. The extension never disables it, for any project.
- **FR-34** — `.vscode/` is not writable by an agent running inside the sandbox, so that a task
  configured to run on folder open cannot be planted from inside the jail and executed outside it.
  Widening this is an explicit, per-case grant.
- **FR-35** — Enforcement does not depend on a host-wide editor setting alone: what can be refused
  from inside the container is refused there too, so that a setting changed for another project
  does not reopen a hole here. What cannot be refused anywhere is FR-37.
- **FR-36** — A credential is handed to an agent as a file, never as a variable. A variable passed
  into the sandbox is re-expanded onto the sandbox launcher's own command line, and that launcher
  runs in the container's process namespace, so the value is readable with `ps` from anywhere else
  in the container. Measured, not assumed: a GitHub token was found that way in a running
  environment.
- **FR-37** — **The gpg-agent and X11 sockets the editor forwards are a recorded limitation, not a
  requirement.** They are created inside the container by the editor's own server when it attaches,
  after every boot hook has run, and no setting in the tooling disables either. So they cannot be
  prevented by the image, by the generated configuration, or by anything this project controls. The
  sandbox does keep them away from the agent, which is the threat the charter names; every other
  process in the container — a terminal, a build, anything that build runs — can reach them. A
  project that cannot accept that should not run a build it does not trust in this environment.

### The remote editor arrives equipped (FR-4x)

- **FR-41** — Opening a project gives the remote editor the extensions and settings the image
  declares for that project's stacks, without the project listing anything.
- **FR-42** — That declaration lives in the image, so adding a stack to the template adds its
  extension without any change here.
- **FR-43** — An extension that cannot be resolved does not prevent the project from opening.
- **FR-44** — The declared list is chosen for this editor and is **not** a translation of the one
  code-server uses. Where the official editor can run something the sandboxed one could not — a
  proprietary debugger, say — the declaration may name it. The two lists coexist: the image keeps
  installing its own for code-server, and only the declared one is read on this path.

### Retiring the launcher (FR-5x)

- **FR-51** — ~~The existing launcher keeps working and says, on every run, that it is deprecated
  and where to migrate.~~ **Superseded.** It shipped, in template `v2.3.0`, and lived one release.
  The deprecation period it opened is closed by FR-53 rather than served.
- **FR-52** — ~~It is removed in the following major version, not before.~~ **Superseded by
  FR-53**, which is the same removal without the waiting.
- **FR-53** — The launcher is deleted, and everything that exists only to build or run it goes with
  it: the crate, the `dev` helper, the launcher's half of `init`, the Tauri libraries in the image,
  and its two CI jobs. Template `3.0.0`.

**Why the first two were written and are now struck.** A deprecation period protects people who
depend on a thing and have not migrated yet. There is one user of this template, and he asked for
the launcher gone rather than announced — so the period was protecting nobody and costing a
release's worth of dead code plus a `@manual` scenario that would never be run. The amendment at the
bottom records what that costs and what it does not.

### Composing and building the image from the editor (FR-6x)

Added 2026-10-01, when absorbing stack selection stopped being an epic named for later. See the
amendment at the bottom for the four decisions this group is the shape of.

- **FR-61** — The editor asks what the image should contain, in steps, using the editor's own
  pickers: which stacks, then a version for each stack chosen, then memory, swap and CPU count.
  One step per question `whiptail` used to ask.
- **FR-62** — The answers are written to `.code-server.stack.json`, which stays the only record of
  what a project selected. The extension adds no second place where that is written down.
- ~~**FR-63** — The extension never composes the Dockerfile. It writes the manifest and invokes
  `setup` non-interactively; composition stays one implementation, in the repository whose CI builds
  an image per stack.~~ **Reversed by the seventh amendment.** Composition is still one
  implementation and still sits beside the CI that builds an image per stack — both moved here. See
  FR-81.
- **FR-64** — The build runs in an editor terminal rather than in the extension's output channel: it
  takes minutes, writes a great deal, and has to be readable after the fact and interruptible while
  running.
- **FR-65** — `whiptail` stops being a prerequisite of anything, and `setup` keeps an interactive
  path that needs no dependency: with a terminal it asks with plain shell prompts, and without one it
  reads the manifest. The host's prerequisites become `jq` and `docker`. **Shipped in template
  `v4.0.0`, and `setup` itself is deleted by FR-81** — the interactive path it kept outlived its
  only remaining caller.
- **FR-67** — The host checks `init` performed are the extension's: `jq` and `docker` present, and
  `docker` actually usable by this user. Each names the package for this distribution's package
  manager, because a wrong name installs the wrong thing on somebody's host and an absent one
  installs nothing while appearing to succeed. `init`, `packages.sh` and its table are deleted; the
  table exists once, where the only thing that reads it is.
- **FR-66** — Each refusal names its own cause and changes nothing: no `docker` on the host, no
  manifest where one is required, a manifest that cannot be parsed, a build that fails, and a build
  the person cancelled. A cancelled build is not a failed one and does not read as one.

**FR-61 through FR-64 are not independent, and the order they ship in was fixed by FR-63:** the
non-interactive `setup` had to exist before anything could invoke it. All four shipped in that
order. With FR-63 reversed, the ordering constraint it imposed is spent — FR-81 removes the thing
that had to exist first.

### The image stops being code-server's (FR-7x)

- **FR-71** — The image is built on a base that carries s6-overlay, the `abc` user, `PUID`/`PGID`,
  `/config` as that user's home and the `cont-init` mechanism, and carries no editor.
- **FR-72** — Nothing in the image exists for code-server: not its extension installs, not its
  settings seeding, not its unauthenticated HTTP server, not `PASSWORD`.
- **FR-73** — A setting reaches the host editor only if it exists because of something the image
  declares. Anything else is the person's own editor configuration and is not written by a project.
- **FR-74** — The generated configuration declares no variable that only code-server read.

**This is a base-image replacement and the cost was measured before the requirements were written.**
`ghcr.io/linuxserver/baseimage-debian:trixie` publishes the conventions the template depends on —
the same ones `docker-code-server` is itself built on, which is
`ghcr.io/linuxserver/baseimage-ubuntu:noble`. So FR-71 is a changed `FROM` rather than a
reimplementation of five mechanisms, and the charter's second amendment overstated it.

**That measurement was wrong, and the method was the reason.** It read HTTP 200 from
`packages.debian.org/trixie/<pkg>` as presence; that page answers 200 whether or not the package is
in the suite. Re-measured against `api.ftp-master.debian.org/madison`, which answers with versions
or with nothing: **67 packages, 61 in trixie, 6 from third-party feeds** — thirty in core and
thirty-seven across the stacks, four of the stack names templated and truncated at the hyphen by the
first extraction. **One rename:** `docker-compose-v2` is Ubuntu's name, and on trixie there is no
Python v1, so `docker-compose` *is* v2.

**Three capabilities were lost, which no package count would have shown.** `openjdk-17-jdk`,
`gcc-11` and `g++-11` are absent from trixie, so java offers 21 and 25 and cpp offers 12, 13 and 14;
a project pinned to either has to provide it itself. And `dotnet` hardcoded
`config/ubuntu/24.04`, which installed on Debian without complaint — the dependency this epic exists
to remove, surviving the epic because the guard was narrower than its own scenario.

**What actually found all of it was the image builds**, as this document predicted in the sentence
that followed the wrong number: existing under the same name is not the same as behaving
identically. The one that cost the most was not a package at all — `baseimage-debian` ends by
deleting `/usr/share/man` and `baseimage-ubuntu` does not, so every JDK's post-install failed
creating a manual-page alternative.

### The extension carries the image (FR-8x)

Added 2026-10-02 by the charter's third amendment. A project installs this extension and needs
nothing else: no submodule, no `setup`, no second repository to bump.

- **FR-81** — The extension carries `core/` and `stacks/` in its own bundle, composes the Dockerfile
  from them, and builds it. `setup` and `core/compose-dockerfile.sh` are deleted; composition stays
  **one** implementation, which is what FR-63 was protecting, and it moves here together with the CI
  that builds an image per stack.
- **FR-82** — No project carries a `.code-server/` submodule, and nothing activates on one. What
  marks a project as this extension's is its manifest.
- **FR-83** — `CLAUDE.md` and `AGENTS.md` ship in the bundle and are written into the project **when
  absent**. A file already there that this extension did not write is somebody's work: the open
  refuses and names it rather than overwriting. Both are tracked in git and carry a project's own
  standing answers, which the generated configuration never did.
- **FR-84** — The normative documents are delivered by the image, never as a copy a project
  maintains. They are written to `/config/.claude/rules/` on every boot, outside the workspace,
  where they load as user-level rules — **no import, and no approval dialog.** A project's
  `CLAUDE.md` does not point at them.
- **FR-85** — `/config/.claude/rules/` is a mount of its own. `/config/.claude` is bind-mounted from
  the host's personal configuration, and writing the documents there would put one project's rules
  into every project on that machine.
- **FR-86** — Only what must govern every turn is written to `rules/`. Everything else in
  `docs/agent/` stays at a readable path in the image: `rules/` is resident in every session, and a
  13.4 KiB document describing a moment that never happens is a cost paid on every turn.
- **FR-87** — What the image contains is verified by image builds in **this** repository: a build
  per stack, each stack's own in-image assertions, and the guards. A requirement about an image that
  no CI builds is a claim, not a requirement.

**FR-84 is the one with a measured rejection behind it, and the measurement is why it reads as it
does.** The obvious mechanism is an absolute `@/opt/.../MODES.md`. Claude Code classifies an import
resolving outside the working directory as *external*, shows an approval dialog once, and — in its
own words — *"if you decline, the imports stay disabled and the dialog doesn't appear again"*. One
click leaves an agent permanently with no modes, no rules and no gates, and nothing ever says so
again. A symlink to a target outside the working directory gets the same treatment, and **no setting
pre-approves the dialog**, so this extension cannot clear it on the user's behalf. The documentation
names the escape it uses instead: *"To load shared rules without that approval, keep them in
`~/.claude/rules/`"*. In the container `~` is `/config` and the image already sets
`CLAUDE_CONFIG_DIR=/config/.claude`, so both readings resolve to the same path.

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

**The spike is done and discarded.** Its four answers, measured on 2026-10-01:

1. **An empty `PASSWORD` leaves code-server unauthenticated.** On the running configuration: the
   root redirects to the workbench and serves it, there is no password field anywhere, and
   `/login` redirects away because there is nothing to authenticate against. FR-18 stands, and its
   premise is now verified rather than inherited from documentation.
2. **The image metadata label is honoured, but only for a prebuilt image.** Resolved against a
   configuration that *builds* its image, the label is invisible — the image does not exist yet
   when the configuration is read. Resolved against `image:`, it is read. Hence FR-19. The merge:
   the configuration wins scalars it sets (`remoteUser`), the image fills what the configuration
   omits (`containerUser`), environment maps merge, and editor customizations form an ordered
   list with the image first and the configuration second, so the configuration is applied last.
3. **Agent forwarding has no switch.** The tooling's own manifest (version 0.470.0) declares 43
   settings and **not one of them governs ssh-agent or gpg-agent**. What exists is
   `copyGitConfig` (defaulting to on), `gitCredentialHelperConfigLocation` (defaulting to
   `global`), `dockerCredentialHelper` (on) and `mountWaylandSocket` (on). So the host-side half
   of FR-3x can close the git credential paths and the Wayland socket, and cannot touch the
   agents. Hence FR-36.
4. **Exactly one stack extension identifier diverges** between the two registries: the C#
   extension. The identifier the image installs today does not exist on the official registry,
   and the official one does not exist on the other. FR-44 makes this a non-issue by not treating
   the lists as translations of each other.

**Still open, and it needs a host.** Answers 2 and 3 were measured against the reference
implementation and the published manifest, not against the editor extension itself. What remains
is to observe the actual behaviour once: that the label is honoured the same way, and what is
forwarded in practice. It is a confirmation step inside story 1, not a second spike.

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

### Epic: the editor composes and builds this project's image

**`whiptail` is retired and the questions it asked are asked by the editor instead.**

The epic closes when selecting stacks, versions and limits happens in the editor, the build runs
from there, and nothing on the host needs `whiptail` any more. `setup` keeps composing and building;
what moves is the asking.

**The cold-start problem this epic was expected to carry turns out not to apply.** It was named here
as "a project with no image cannot have its stacks analysed by an agent, because the agent runs
inside the image". That is about *detecting* what a project needs, which belongs to the adoption
epic. This epic only *asks*, and asking happens on the host in the editor, before any container
exists.

| # | Story | Repo | Why in that order |
|---|---|---|---|
| 1 | the template stops asking | template | FR-63: the non-interactive `setup` has to exist before anything can invoke it |
| 2 | the editor asks | extension | needs a manifest format to write and a `setup` to hand it to |
| 3 | the editor builds | extension | needs both of the above |

Story 1 is the only one with image builds behind it, and it is where `whiptail` actually leaves:
`setup`, `init`, `packages.sh` and the host prerequisite list. Stories 2 and 3 are the extension's
and are tested without an editor — the five steps are pure functions over a manifest, and the build
is a command that composes a task.

### Epic: the extension carries the image

**A project installs an extension. There is no template to consume.**

The epic closes when a project has no `.code-server/` submodule, no `setup` on its host and no
second version to keep in step — the extension composes and builds from what it bundles, writes
`CLAUDE.md` and `AGENTS.md` when they are absent, and the image delivers the normative documents to
`/config/.claude/rules/` where they load without an import.

**`jvsl.env.agents.code-server` is absorbed and archived.** Decided by João Lima on 2026-10-02. Its
`core/`, `stacks/`, `scripts/` and `docs/agent/` move into this repository with their CI; the repo
is archived once the move is verified by a green build here, not before. The alternative was keeping
it as the place that content is authored and CI-verified while this one vendors it at release time
— rejected because it preserves exactly the two release trains and the pointer-to-bump that this
epic exists to remove.

**The order is fixed by what cannot be verified until the CI exists.** FR-87 comes first: moving
4629 lines of shell into a repository that cannot build an image means every later story lands
unverified, and "it worked in the other repo" is not a result. The documents story comes last,
because it is the only one whose acceptance needs a running container.

| # | Story | Why in that order |
|---|---|---|
| 1 | the image builds here | FR-87 — nothing below is verifiable until it does |
| 2 | the bundle carries the image's content | FR-81, FR-82 — needs the builds to prove the move changed nothing |
| 3 | the extension composes and builds | FR-81 — needs the content to compose from |
| 4 | a project needs nothing but the extension | FR-83 — the files it writes, and refusing to overwrite |
| 5 | the documents arrive with the image | FR-84, FR-85, FR-86 — the only story needing a container to accept |

**Story 1 is where the template repository stops being the authority** and is the one to grill
hardest: it is a CI move, and a CI move that silently drops a job leaves a guard that reports
nothing. Each of the thirteen guards and each stack's in-image assertions has to be observed running
here, by name, before the archive.

### Epics named but not decomposed

Named so the first release does not close the door on them. None has stories until it is grilled,
and none starts before the epic above closes. **Two of them stopped being optional on 2026-10-01**
— see the charter's second amendment, which is where the reasoning and the cost are recorded.

- **The image stops being code-server's** — **decomposed and shipped** in template `v4.0.0` and
  `v5.0.0`. It is no longer in this list. The fallback it gave up — a browser against a loopback
  port when the Dev Containers extension will not attach — is gone as predicted, and was not
  needed.
- **Absorbing stack selection** — **decomposed below**, as *the editor composes and builds this
  project's image*. It is no longer in this list.
- **Starting a new project** — the initialization interview, conducted inside the project's own
  container as its first session.
- **Adopting the template into an existing project** — stack detection by heuristic on the host,
  confirmed by the user, before any agent exists to ask.
- **The agents screen** — connecting an agent once, renewing on request, and where each agent's
  credentials live.

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
- ~~**One repository for the extension and the image.** Rejected: the image has CI that builds
  images and this does not, and merging them would put the extension's code in a repository whose
  release train is about something else.~~ **Reversed by the seventh amendment**, which accepts
  both costs rather than disputing them: this repository grows the image builds, and its release
  train does gate on them from then on. What changed is the weight of the other side — two release
  trains and a pointer every project has to remember to bump turned out to cost more than one slow
  pipeline.
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

The sections above are as written at the gate and were not edited afterwards, except where an
amendment below says otherwise.

### Amendment, 2026-10-02 (seventh)

**The template stops being something a project consumes.** Follows the charter's third amendment;
the reasoning and the costs are there and are not repeated. What this document changes:

| | |
|---|---|
| FR-11 | said "carries `.code-server/`" — names a submodule, not what the flow needs |
| FR-18 | **struck, satisfied absolutely** — FR-71 removed the editor, so there is no port to publish |
| FR-21, FR-22 | **struck** — no submodule to be uninitialized, no second version to disagree with |
| FR-23 | "The extension does not build images" had been struck in the fifth amendment and left in the text |
| FR-63 | **reversed** — composition moves here, with the CI that builds an image per stack |
| FR-65 | `setup`'s interactive path outlived its only caller |
| new | **FR-81 – FR-87**, and the epic *the extension carries the image* |
| alternative | *"One repository for the extension and the image"* — **reversed**, accepting both of its costs |

**`jvsl.env.agents.code-server` is absorbed and archived**, decided by João Lima on 2026-10-02. The
archive happens after a green image build here, never before. The alternative — keeping it as where
that content is authored while this repository vendors it at release — was rejected for preserving
the two release trains the epic exists to remove.

**A correction I owe this document.** The charter's third amendment says *"FR-74 is deleted"*. FR-74
is "the generated configuration declares no variable that only code-server read", which stands and
shipped. The requirement that dies with the minimum template version is **FR-22**, and FR-21 goes
with it. I wrote the wrong number into an accepted charter and it merged; the charter is corrected in
the same change as this.

**And a measurement in this document was false in two places.** It said all sixty-five `apt`
packages exist in trixie under the same names, zero renames, from reading
`packages.debian.org/trixie/<pkg>` — a page that answers 200 whether or not the package is in the
suite. Re-measured with `api.ftp-master.debian.org/madison`: **67 packages, 61 in trixie, 6 from
third-party feeds, one rename**, and three versions no longer offered — `openjdk-17-jdk`, `gcc-11`
and `g++-11` are absent, so java offers 21 and 25 and cpp offers 12, 13 and 14. The template's own
documents were corrected when it was found; this one was not, and a requirements document carrying
a false measurement is worse than one carrying none, because the number looks checked.

### Amendment, 2026-10-02 (sixth)

**FR-7x, and a correction to what the charter said this would cost.** The charter's second amendment
listed five things that "arrive from that base and are installed nowhere in the template" —
s6-overlay, the `abc` user, `PUID`/`PGID`, `/config`, `cont-init` — and left the reader to conclude
that removing code-server meant reimplementing them. **It does not.** LinuxServer publishes the base
without an editor, and the code-server image is itself built on it:

```
docker-code-server/Dockerfile:  FROM ghcr.io/linuxserver/baseimage-ubuntu:noble
baseimage-ubuntu:noble:         s6-overlay 3.2.1.0
                                useradd -u 911 -U -d /config -s /bin/false abc
                                init-adduser       ← applies PUID/PGID
                                init-custom-files  ← the custom-cont-init.d hook
```

So the epic is a changed `FROM` plus the removal of what the template does *for* code-server. That
was worth measuring before writing requirements shaped by the wrong cost.

**`baseimage-debian:trixie` rather than the `baseimage-ubuntu:noble` the image is on today.** The
cheaper choice was the same base, which changes nothing but the editor's absence; Debian trixie was
chosen for what it brings, accepting a re-check of the `apt` names. **Measured afterwards, twice:
the first measurement said sixty-five names and zero renames and was wrong** — it read a page that
answers 200 regardless. The real figures are 67 packages, 61 in trixie, 6 from third-party feeds,
one rename, and three versions no longer offered. The risk accepted was real after all, and the
lesson is about the method rather than the choice: a source that cannot say "no" cannot be used to
establish presence.

**FR-73 is the one that is not mechanical.** Seven settings are seeded today for code-server to read.
The repository's own comments classify two of them: `window.menuBarVisibility: classic` exists
because "the web build shows a hamburger by default", and `chat.disableAIFeatures` had its key
"verified against the VS Code build this image actually ships (1.129.0 via code-server 4.129.0)" —
the host editor is 1.140.0. The other five are preference or an unmeasured workaround.

The rule chosen is narrower than "keep what is useful": **a setting reaches the label only if it
exists because of something the label installs.** `workbench.iconTheme` qualifies — without it the
`file-icons` extension the image declares is installed and does nothing. The decision was to keep
what still makes sense, measured item by item, and the open question underneath it is not a
preference at all: **several of these may be application-scoped in VS Code and therefore not
settable from a container at any price.** That is measured in the epic's first story, before
anything is moved.

### Amendment, 2026-10-01 (fifth)

**`whiptail` is being retired, which turns "absorbing stack selection" from an epic named for later
into FR-61 through FR-66 and a decomposition.** The request was specific: a screen in the extension
replacing the `whiptail` prompts, and `init` as a button beside it. Four decisions came out of
grilling it, and each is a requirement above rather than a note:

- **The editor's own pickers, in steps, not a webview.** One step per question `whiptail` asked, so
  the mapping is checkable; a webview is HTML, a content security policy, message passing and a
  theme to match, which is a project inside this project for a checklist and three numbers.
- **The extension writes the manifest and invokes `setup`; it never composes the Dockerfile.**
  Two implementations of one composition is the failure this template has already paid for once —
  CI and `setup` each built the concatenation themselves, the copies drifted, and
  `stack-build (android)` failed in CI in a way that never reproduced through `setup`.
- **The build runs in an editor terminal.** It takes minutes and writes a great deal; an output
  channel cannot be cancelled, and a build nobody can stop is a build somebody kills from another
  window.
- **Without the editor, the manifest is the interface.** It already is the only record; `setup`
  reads it and builds. The host's prerequisites become `jq` and `docker`, and `whiptail` leaves the
  list rather than becoming optional.

**What this gives up, corrected.** This paragraph first said a host-only user would lose the
checklist and select stacks by editing JSON. That was settled differently at the story gate: `setup`
keeps an interactive path, with plain `read` prompts and no dependency, used when it has a terminal.
So nothing is lost there — and the cost moved rather than disappeared.

**The cost is two implementations of the asking**: five shell prompts in `setup` and five pickers in
the extension. That is accepted with its eyes open, and it is narrower than it looks: neither one
*decides* anything, both write the same manifest, and the manifest is what everything downstream
reads. What would have been unacceptable is two implementations of the **composition**, which FR-63
exists to prevent, and this is not that.

`setup` flags were considered and rejected as a second way of saying what the manifest already says.
`whiptail` behind a TTY check was considered and rejected because it does not retire `whiptail`,
which was the request.

### Amendment, 2026-10-01 (fourth)

**FR-51 and FR-52 are struck, and FR-53 replaces both.** The launcher is deleted now rather than
announced now and deleted later.

**The deprecation period was protecting nobody.** It exists to give people who depend on a thing
time to move, and this template has one user, who asked for the launcher gone rather than announced.
What it was costing instead: a release carrying code written to be deleted, a `@manual` scenario
nobody would run, and a story whose entire subject was a message.

**The notice did ship, and that is deliberate rather than a leftover.** Template `v2.3.0` carries
it, because that release also carries the fix for a GitHub token readable with `ps` from anywhere in
the container — a live security defect in the one environment using this. Holding the release to
keep a changelog tidy would have kept the token exposed. So the notice lives exactly one version,
for a reason that has nothing to do with deprecation.

**What FR-53 takes with it, measured rather than listed from memory:** `start/` (the crate), `dev`
(which does nothing but build and run it), the launcher's half of `init` — the display and WSLg
check, the five Tauri library checks, and the `cargo` requirement, which was the only prerequisite
`init` refused to install — the four Tauri `-dev` packages in the image, and the `cargo-check` and
`title-bar` CI jobs. **`rustup` stays**: the `rust` stack depends on core's installation rather than
its own, and `RUSTUP_HOME` is forwarded into the sandbox for that reason.

**What is given up.** The host stops being able to open the environment at all without the editor
and the Dev Containers extension. Combined with the charter's second amendment — which schedules
code-server's removal from the image — the fallbacks go one at a time and the end state has none:
`docker exec` and a terminal. Each step was chosen knowingly; the sum of them is worth saying out
loud once, here, rather than discovering it on the day the editor will not attach.

### Amendment, 2026-10-01 (third)

**Two epics stopped being optional.** "Absorbing stack selection" was named here as a door left
open and not scheduled; "the image stops being code-server's" was not named at all, because the
charter listed removing code-server as a deliberate non-goal. The objective is now that the
extension opens, builds, and leaves no code-server in the image. Both are recorded above as
*intended*, with the order recommended and the reason for it, and the charter's second amendment
carries what is being given up — the browser-against-loopback way in when the Dev Containers
extension will not attach.

Nothing in FR-1x through FR-5x changes. The epic in progress is unchanged and is a prerequisite
rather than a competitor: an image whose base is being replaced is not a thing to attach a
host editor to for the first time.

**One requirement acquires a deadline it did not have.** FR-4x's rule for choosing extension
identifiers falls back to *"the same identifier the `code-server` list already installs"*. That
list is now scheduled to disappear, so the fallback half needs another anchor before the epic that
removes code-server ships. The story is not reopened — the list exists until then — and that epic
owns the replacement.

### Amendment, 2026-10-01 (second)

**FR-31 asked for something that cannot be delivered, and FR-36 asserted the mechanism that would
deliver it.** Both were written from the spike, which established that no setting in the tooling
disables agent-socket forwarding, and concluded that the image would therefore have to refuse the
sockets from inside. Measured in a real environment since:

- `/config/.gnupg/S.gpg-agent` and `/tmp/.X11-unix/X0` exist and are sockets. **ssh-agent is not
  forwarded** — no socket anywhere in the container — so one third of the original requirement was
  already satisfied and nobody knew.
- Neither appears in `/proc/mounts`. They are **not** bind-mounted at container creation: the
  editor's server creates them inside the container when it attaches, which is after every boot
  hook has run. A `cont-init` covering those paths covers nothing.

So FR-31 is narrowed to what the sandbox actually enforces — the agent's reach, which is the threat
the charter names — and the rest becomes FR-37, a limitation written down rather than a requirement
nobody can meet. FR-36 is replaced by the rule that came out of the credential finding, which is a
requirement that *can* be met and has been.

Three mechanisms were considered for keeping the original FR-31 and rejected. A
`postAttachCommand` in the image's metadata races the server that creates the sockets, and the
ordering is undocumented — a fix that works most of the time produces the belief of coverage, which
the rules name as worse than none. Making the target directories unwritable breaks legitimate gpg
use and touches a directory that is normally world-writable. And leaving the requirement as written
would have been the same kind of false assurance as the comment that claimed a forwarded token
stayed out of `ps`.

### Amendment, 2026-10-01 (first)

Two changes, from the spike and from one observation that followed it.

**The spike's answers replaced the spike's description**, which the section itself required. One
of them changed a requirement rather than confirming it: image-declared metadata is resolved only
for a prebuilt image, so FR-19 now forbids the generated configuration from building one. Another
hardened an existing decision into the only available mechanism: there is no setting anywhere that
disables agent forwarding, so FR-36 states that FR-31 is satisfied inside the container or not at
all. The decision to enforce isolation from both sides was made before this was known; it turns
out one of the two sides does not exist.

**The remote extension list is its own list, not a translation** (FR-44). Committing to the
official editor makes proprietary extensions usable that the sandboxed editor never could use, and
the C# debugger is the concrete case. The charter was amended in the same change, because it had
claimed the container tooling was the only non-free piece of the stack.
