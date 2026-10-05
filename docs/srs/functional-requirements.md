# Functional requirements

## Opening a project (FR-1x)

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

## Refusing what cannot be opened (FR-2x)

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
- ~~**FR-23** — A project whose image does not exist is refused, naming the image and the command
  that builds it.~~ **Never implemented, and struck on 2026-10-04 rather than reversed.** Measured
  while writing FR-89's task: `decideOpen` refuses on four things — the reopen command, the
  launcher's container, a hand-written configuration, and a `.gitignore` that does not ignore the
  generated file — and **none of them is about an image**. Nothing in `src/` ever inspected one.
  What a project got instead was the Dev Containers extension failing on its own, with a message
  about a missing image rather than about what to do, which is the gap this requirement was written
  to close. FR-89 does not reverse it; FR-89 is the first thing to act on a missing image at all.
- **FR-24** — A host where the container runtime is not reachable is refused, saying so, rather
  than failing somewhere later with a message about something else.
- **FR-25** — Installing on an editor build that cannot use the container tooling fails at install
  time rather than degrading silently at run time.

## Isolation across the boundary (FR-3x)

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

## The remote editor arrives equipped (FR-4x)

- **FR-41** — Opening a project gives the remote editor the extensions and settings the image
  declares for that project's stacks, without the project listing anything.
- **FR-42** — That declaration lives in the image, so adding a stack to the template adds its
  extension without any change here.
- **FR-43** — An extension that cannot be resolved does not prevent the project from opening.
- **FR-44** — The declared list is chosen for this editor and is **not** a translation of the one
  code-server uses. Where the official editor can run something the sandboxed one could not — a
  proprietary debugger, say — the declaration may name it. The two lists coexist: the image keeps
  installing its own for code-server, and only the declared one is read on this path.

## Retiring the launcher (FR-5x)

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

## Composing and building the image from the editor (FR-6x)

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

## The image stops being code-server's (FR-7x)

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

## The extension carries the image (FR-8x)

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
- **FR-88** — The extension chooses the folder. A project is opened by picking its directory from
  the extension, not by the directory having been opened first, and the extension activates with no
  folder open.
- **FR-89** — A project whose image does not exist is **built**, not refused. **Said to reverse
  FR-23 and does not**: that requirement was never implemented, and a reader looking in a diff for a
  refusal being removed would find nothing. This is the first thing in this extension to notice a
  missing image.
- **FR-90** — A new project is scaffolded into a directory the user chooses: the manifest, the
  instruction files of FR-83, and `.ai-memory.toml` when asked for. The questions are the ones
  FR-61 already asks, plus `ai-memory` and the location.
- **FR-91** — Scaffolding initialises git and commits once, **and only into a directory that is
  empty or not already a repository.** Anything else is somebody's work: it refuses and names what
  it found. The same rule as FR-83, for the same reason.
- **FR-92** — A panel offers both entries with no folder open, and offers nothing it cannot do. An
  entry present before its capability exists is worse than an absent one.

**The two flows are one flow with a prefix.** Creating a project is scaffolding followed by opening
it, and after FR-90 writes the manifest there is nothing left that is specific to creation. This is
worth stating as a requirement-level fact rather than an implementation note, because two flows that
look similar and are implemented twice diverge — which is the reason the launcher was deleted
rather than kept as a fallback.

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

## The work has a tracker (FR-10x)

**A new decade rather than FR-93.** The FR-8x section already holds FR-81 to FR-92, so continuing
there would overflow a second decade and make the section name a lie twice over.

**Two layers, and only one of them is ours.** An item in somebody else's tracker — an Azure DevOps
epic at work, an issue on a repository — says *what*. Beads says *how*: the breakdown, the order,
what blocks what, and where each piece stands. Nothing here writes to the other tracker, and the
manual hand-off is accepted rather than designed around.

- **FR-100** — The image installs the `bd` CLI at a pinned version with its published checksum
  verified, by the same rule as `ai-jail` and `ai-memory`. Not the project's install script: a
  script fetched and piped to a shell verifies nothing, and the release publishes a `checksums.txt`
  precisely so it does not have to be trusted blind. The cost is named rather than hidden — the
  linux-amd64 asset is 50.8 MB compressed, the largest single thing the image fetches, because the
  storage engine is compiled into the binary.
- **FR-101** — Beads is **opt-in through a marker in the project**, as `ai-memory` is through
  `.ai-memory.toml`. Without the marker there is no database, no boot initialisation and no extra
  grant in the sandbox. This widens what the agent can reach, so it widens only where somebody asked
  for it.
- **FR-102** — The database lives on the project's volume, outside the repository, and `bd` is
  always initialised with `--stealth`. Stealth writes `no-git-ops: true`, so no git hook is installed
  and nothing is committed — which is what makes the arrangement usable in a repository that is not
  the user's to change. The consequence is accepted: work state belongs to the environment rather
  than to the clone, and a fresh machine starts empty.
- **FR-103** — `BEADS_DIR` crosses into the sandbox by name and its directory is mapped read-write.
  **Both halves, because either alone is a silent wrong answer.** `bd init` must be explicit and
  nothing works before it, so a missing map is a failure; and a missing variable is worse than a
  failure, because `bd` then resolves a *different* directory and reports success about the wrong
  database. That is measured rather than feared: `ai-memory` without `AI_MEMORY_DATA_DIR` resolves
  `/config/.local/share/ai-memory` while the server its boot hook started serves
  `/config/ai-memory`.
- **FR-104** — **Beads holds state; documents hold what was agreed.** Status, order and blocking live
  in Beads and nowhere else. A charter, an SRS, an epic, a story and a task design stay markdown in
  the repository, reviewed in a pull request, because the thing they carry — why this order, what
  this deliberately does not do, what was measured — is not a field.
- **FR-105** — An item that came from another tracker carries its origin in `--external-ref`, and the
  origin item is never written to. One field rather than a convention in the title, so that losing
  the link requires deleting something rather than forgetting something.
- **FR-106** — `bd ready` informs and does not authorise. The agent may report what is unblocked; it
  may not start work that has not been through its gate. A tracker that knows what is possible is not
  thereby a tracker that decides what happens, and the gates are where this project has found most of
  its design errors.
- **FR-107** — `bd remember` is not used. `ai-memory` keeps knowledge and context; Beads keeps the
  state of work. Both tools ship a memory, so the boundary is written down rather than left to
  whichever one the agent reaches for first — two stores of the same kind of thing is how both become
  untrustworthy.
- **FR-108** — The create-project flow asks about Beads exactly as it asks about `ai-memory`, and
  writes the marker of FR-101 when asked. The one moment somebody is deciding what a project *is* is
  the right moment to ask.
- **FR-109** — **A guard fails when a status appears in markdown under `docs/`.** Without it FR-104 is
  a convention, and this repository has already established that a convention nothing verifies is
  indistinguishable from nothing — the argument `scripts/every-test-has-a-runner.test.sh` exists for.
  No exemption list: documents of closed work lose their status row too, because a status is state and
  state has a new home. What those documents keep is their `Outcome`, which is the verdict rather than
  the state.

## The rename left things behind (FR-11x)

**Every one of these was found by somebody using the extension, not by a test**, and that is the
epic's whole observation rather than an apology. A rename changes identities — an extension's, a
command's, a file's — and an identity that is wrong does not fail. It resolves to nothing, or to
something stale, and says nothing either way.

- **FR-110** — The project manifest is named for the product that reads it:
  `.agent-container.stack.json`. The old name is `.code-server.stack.json`, after a template that is
  archived and absorbed, and it is the one file of all this that lives in every project's repository.
- **FR-111** — **The extension activates on both names.** The activation event is what decides
  whether it wakes at all, so a project carrying the old name must still be seen — otherwise nothing
  can report anything, including the fact that the name changed.
- **FR-112** — **It renames the file itself, and says that it did.** Finding only the old name, it
  writes the new one, removes the old, and reports it once. This is the one place this extension
  touches a tracked file it did not create in that moment, and it is allowed exactly because the file
  *is* its own: the manifest is written by the configure flow, and renaming one's own file is not the
  thing FR-83 and FR-91 refuse.
- **FR-113** — **It renames only a manifest it recognises, and never overwrites.** A file at the old
  path that does not parse as a manifest is left alone and reported; a project that already has the
  new name keeps it, and the old one is not merged into it. The refusal is the same rule as FR-83 —
  what the extension did not write is somebody's work — applied to the one case where the two names
  disagree.
- **FR-114** — **An older copy of this extension, still installed, is found and named.** The rename
  changed the extension's identity, so installing the current one does not replace
  `thehefty.jvsl-env-agents-vscode`: both remain, and the older keeps contributing palette entries
  whose titles still look right and whose commands no longer exist. The failure a person sees is an
  instruction that does nothing, with no error anybody can act on.
- **FR-115** — That notice is said once and is not a blocker. Nothing about the older copy stops the
  current one working; it costs a person time and a wrong belief, which a sentence fixes and a modal
  on every window does not.
