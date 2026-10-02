# Project Charter: jvsl.env.agents.vscode

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-30 |
| **Author** | João Lima |
| **Kind** | new |

## Purpose

Someone working on a containerized project with sandboxed AI agents wants an editor that does not
compete with the build for the machine. Today it does: the editor runs inside the same container as
the toolchains, the agents and the nested Docker daemon, sharing one `--cpuset-cpus` with all of
them, and it freezes while a build is running. That was measured, not suspected, and attaching a
host editor to the same container by hand was measured as the fix.

This project exists to make that arrangement the normal one: the editor on the host, outside the
container's CPU and memory limits, and everything that must stay contained still contained — the
agents in their jail, the toolchains, the nested daemon. The deliverable is a VS Code extension
that stands up the container and connects the host editor to it. The constraint that makes it a
project rather than a shortcut: moving the editor out must not weaken the isolation the container
exists for.

**The deliverable has grown twice since this was written**, both times recorded in an amendment
below. It replaced the Tauri launcher the template shipped — that launcher is deleted. And as of the
third amendment it carries the image content itself: a project no longer consumes a template, it
installs this extension.

## In scope / out of scope

**In scope.**

- Opening a project that is already set up: generating its dev container configuration from
  `.code-server.stack.json` and the host's actual capabilities, standing the container up, and
  connecting the host editor to it as `abc` in `/config/workspace`. **Said as "a project that
  already carries `.code-server/`" until the third amendment**, which is being specific about a
  submodule that is going away; what the flow actually needs is the manifest.
- Enforcing isolation across that boundary — no ssh-agent, gpg-agent, X11, host git credential
  helper or host gitconfig reaching the container, and Workspace Trust left on.
- Deprecating `.code-server/start` and its Tauri window.
- Declaring, and verifying at runtime, the minimum template version this extension requires.
- **Later, in epics of their own:** composing and building the image from the editor, and taking
  code-server out of the image altogether. Both were out of scope when this charter was accepted
  and are not any more — see the amendment at the bottom for what changed and what it costs.
  Neither is started until the current epic closes.

**Out of scope, deliberately.** Each of these is a thing a reader might reasonably assume is
included:

- **Hosts other than Linux.** WSL, macOS and Windows are not supported and are not designed
  around. WSL is the first candidate to revisit; the others are not.
- **Editors other than Microsoft's VS Code.** VSCodium, Cursor and Windsurf cannot use the Dev
  Containers extension this one depends on, and supporting them means reimplementing the remote
  attach against a proprietary protocol.
- **Removing code-server from the image, and building images — in *this* epic.** Both are now
  project goals and each is its own epic; neither is out of scope any more. What stays out of scope
  is doing either of them inside the epic that replaces the launcher. The reason is the one this
  charter gave for the first release being a single flow: replacing `start` is a one-for-one swap,
  and anything more makes the comparison dishonest. `.code-server/setup` remains the thing that
  composes and builds until the epic that absorbs it ships, and a missing image stays an error this
  extension names rather than one it fixes.
- **The other two flows.** Starting a new project with an initialization interview, adopting the
  template into an existing project, and the agents screen are later epics. The first release does
  one thing: open a project that is already set up.
- **Agents other than Claude Code**, and any change to where agent credentials live.
- ~~**Changes to the container image.** Those are the template's, in its own repository, under its
  own epic. This project depends on them and does not contain them.~~ **Struck by the third
  amendment.** This project contains them.
- **Publishing to a marketplace**, and **telemetry of any kind**.

## Stakeholders

- **Maintainer and sole decision-maker** — João Lima. Decides what "done" means and must be
  consulted before scope changes.
- **Consumers** — monorepos that have adopted the `jvsl.env.agents.code-server` template. They
  receive this extension through that template's releases, so a change here reaches them only when
  they bump.
- **The template** — a dependency with its own release train, its own CI and its own repository.
  It is not a stakeholder that can be asked for anything; it is a contract to be versioned against.

## Standing decisions

- **Mode of work — Pair Programming Mode.** The agent drives, the user navigates. Inherited from
  how the template and its consuming monorepos are already worked on, and chosen for the same
  reason: the decisions worth stopping for here are architectural, and there are few of them per
  unit of code.
- **Documentation language — English.** The normative documents ship from the template in English
  and are read through imports, so the project's own documents match them. Translating a local copy
  is how a project ends up on a rule the template retired two versions ago.
- **Long-term memory — on.** The project carries `.ai-memory.toml`. It buys a handoff across
  sessions and search over decisions already made, which is worth more here than usual: the design
  is a long chain of small irreversible choices about isolation, and re-deriving them costs more
  than recording them. It costs prompts and tool excerpts captured to disk, per project, with no
  LLM provider configured — so nothing captured leaves the machine.
- **Licence — MIT**, inherited from the template and from the monorepos built on it, and permitted
  by the dependencies: the extension links nothing at runtime beyond VS Code's own API.
- **A non-free dependency, accepted knowingly.** The Dev Containers extension
  (`ms-vscode-remote.remote-containers`) is proprietary, is not on Open VSX, and is licensed for
  use only in Microsoft's own build of VS Code. It is the **load-bearing** non-free dependency:
  this project delegates the container lifecycle to it rather than reimplementing it. The
  dependency is declared hard, so installing on a build that cannot use it fails at install time
  rather than degrading in silence.
- **Proprietary editor extensions, where they are better.** Committing to Microsoft's build makes
  its proprietary extensions usable, and some of them are what the sandboxed environment could not
  have before — the official C# extension ships a debugger, which is the reason an Open VSX fork
  of it exists at all. The image may name them for a stack. They carry the same licence
  restriction as the dependency above, which this project already accepts, and they are a
  convenience rather than load-bearing: an extension that cannot be resolved does not stop a
  project opening.
- **Who this is for, and what it processes.** Open-source code, published, for the maintainer and
  for anyone consuming the template. **No personal data is processed at all** — the extension runs
  entirely on the user's machine, collects nothing, and sends nothing anywhere. There is no
  telemetry, and adding any would be a change to this charter, not a feature.

## What would change this charter

- **Adding telemetry**, or any component that reports to a service. It would turn "no personal data
  is processed" into a data map, a legal basis and a retention period.
- **Publishing to a marketplace.** Distribution obligations and a support channel follow, and the
  audience stops being "projects that adopted the template".
- **Supporting a non-official editor build.** It would mean reimplementing the remote attach, which
  is a project inside this project and a different purpose.
- **Deciding to run an agent on the host.** Every isolation decision below this charter assumes
  agents run inside the container, in their jail. Reversing that reopens all of them.
- **The Dev Containers extension being discontinued or relicensed.** The delegation above stops
  being available and the scope changes shape.
- **Replacing the image's base again.** This fired once already: the base was
  `FROM lscr.io/linuxserver/code-server` and is now
  `ghcr.io/linuxserver/baseimage-debian:trixie`, pinned by digest. What made it a charter-level
  change is unchanged and is what this clause now guards — s6-overlay, the `abc` user,
  `PUID`/`PGID`, `/config` as the bind-mounted home and the whole `cont-init` mechanism arrive from
  the base and are installed nowhere. Every isolation and ownership decision here rests on those
  five. Leaving the LinuxServer family reopens all of them, and the swap that already happened
  stayed inside it for exactly that reason.

## Outcome

Accepted by João Lima on 2026-10-01, after the initialization grilling that produced it.

What the grilling changed, against what was proposed going in:

- **The extension no longer runs `docker run`.** The proposal was for it to create the container
  itself and have Dev Containers attach to the result. It generates a `devcontainer.json` instead
  and delegates the whole lifecycle — create, stop, rebuild, reconnect after a window reload — to
  Dev Containers. The attach path is the one that produced every isolation defect found in manual
  testing, and the lifecycle is work this project would otherwise own forever.
- **`initializeCommand` is a guard, not a generator.** Checked during the grilling: it runs after
  the configuration has been read, and its ordering against the Docker commands is unspecified,
  with open bugs where compose is inspected first. Anything dynamic is computed before Dev
  Containers is handed control.
- **The Tauri window is not kept as a fallback.** It is deprecated with a message naming the
  migration and removed in the following major. code-server stays in the image instead, and its
  port is not published unless the project manifest asks — an HTTP server with no authentication
  on loopback is not a convenience.
- **"Open an existing project" is two flows, not one.** Because agents run inside the container,
  a project with no image cannot have one analysed by an agent. Opening is for projects that
  already carry `.code-server/`; adopting the template into one that does not is a separate flow
  that detects stacks by heuristic on the host.
- **The first release is one flow.** Opening only. The initialization interview, adoption and the
  agents screen were in the original proposal and are now later epics — replacing `start` is a
  one-for-one swap, and anything more makes the comparison dishonest.
- **An assumption was refuted.** `ai-memory`'s port was believed random per container, making the
  shared `~/.claude` registration overwrite itself across projects. It is fixed at 49374
  (`core/services/svc-ai-memory/run`), so containers do not collide. The real exposure is an agent
  on the *host*, which the decision to run agents only inside the container removes.
- **The planning is split across two repositories**, and only this one gets a charter. The image
  work the first release depends on is planned in the template, under an epic in its
  `docs/PLANNING/`, without a retroactive charter or SRS for a product already at 1.8.0.

The sections above are as written at the gate and were not edited afterwards, except where an
amendment below says otherwise.

### Amendment, 2026-10-01 (first)

Committing to Microsoft's build of VS Code also makes its proprietary extensions available, which
the sandboxed editor this replaces could never use. "Standing decisions" previously called the Dev
Containers extension *the single piece of this stack that is not free software*; adopting those
extensions makes that sentence false, so it now reads *the load-bearing non-free dependency* — the
claim that was actually doing the work — and the extensions are recorded as a decision of their
own. The alternative considered and rejected was declining the proprietary extensions to keep the
original sentence true, which would have traded a working C# debugger for a property of a
document.

### Amendment, 2026-10-02 (third)

**The template stops being something a project consumes, and this extension becomes the whole
delivery.** Decided by João Lima on 2026-10-02, in these words: *"eu não quero mais o template e o
code-server eu quero que a extensão inicalize tudo pra mim."*

What that means concretely. The extension carries `core/` and `stacks/` in its own bundle, composes
the Dockerfile itself, and builds it. A project gets no `.code-server/` submodule, no `setup`, and
no second repository to bump. **"Changes to the container image — those are the template's, in its
own repository. This project depends on them and does not contain them"** is struck from the
non-goals: this project now contains them. So is the SRS's rejected alternative *"One repository for
the extension and the image"*, whose stated reason — the image has CI that builds images and this
does not — **does not disappear, it becomes work.** The extension's repository has to grow the image
builds, the per-stack `image.test.sh` runs, and the guards, and its release train gates on them from
then on.

**What this costs, so that nobody discovers it later.** Four thousand six hundred and twenty-nine
lines of shell become this project's to own — `core/` is 3417 across 34 files, `stacks/` 1212 across
39 — plus 1066 lines of guards that exist because each of them caught something. Changing one
stack's offered version becomes an extension release rather than a submodule bump. And a rule
corrected in the normative documents reaches a project by extension update *and a rebuild*, where
today it reaches by bumping a pointer; whether that is better is genuinely arguable, and it is
chosen because a pointer every project has to remember to bump is the thing that was not happening.

**FR-21 and FR-22 are deleted, and FR-22 merged today.** The minimum template version — read from
`version.txt`, compared with `isAtLeast`, refusing to open below `5.0.0` — exists to catch a project
whose submodule is behind the extension, and FR-21 refuses a submodule that was never initialised.
**This paragraph said "FR-74" when it was accepted**, which is the requirement that the generated
configuration declares no variable only code-server read — that one stands and shipped. Corrected
here rather than left, because a wrong requirement number in an accepted charter is a wrong
instruction to whoever acts on it. When the extension *is* the template there is no second
version to disagree with, so the requirement, the three refusal messages and the version-reading
machinery all go. Recorded plainly because the work shipped hours before this amendment, and a
requirement quietly left in place after its reason went is how a check outlives what it checked.

**The process documents travel in the image, and not by absolute import.** They must keep arriving
with the environment rather than as copies a project maintains — that property is the reason the
submodule arrangement existed and it is not being given up. The obvious mechanism is an absolute
`@/opt/.../MODES.md` in a project's `CLAUDE.md`, and it was rejected on a measurement. Claude Code's
documentation is explicit that absolute paths are allowed, and equally explicit about what an import
resolving outside the working directory is:

> The first time Claude Code encounters external imports in a project, it shows an approval dialog
> listing the files. **If you decline, the imports stay disabled and the dialog doesn't appear
> again.**

One decline leaves an agent permanently working with no modes, no rules and no gates, and nothing
ever says so again — a worse version of the silent-import failure this charter's own project
documents as unacceptable. A symlink does not escape it; a target outside the working directory gets
the same treatment, and **no setting pre-approves the dialog**, so an extension cannot clear it on
the user's behalf.

**The documentation names the escape, and it is the mechanism.** *"To load shared rules without that
approval, keep them in `~/.claude/rules/`, where they apply to every project on your machine."* In
the container `~` is `/config` and the image already sets `CLAUDE_CONFIG_DIR=/config/.claude`, so
both readings give the same path and there is nothing to get wrong. The documents live at
`/config/.claude/rules/`, **outside the workspace, which is where they were asked to be**, and they
load with no import and no dialog. Nothing in a project's `CLAUDE.md` points at them.

Two consequences, each a decision rather than a detail. `/config/.claude` is bind-mounted from the
host's own `~/.claude`, so a hook writing there would write into the user's personal configuration
and reach every project on that machine — the generated configuration therefore mounts a volume
over `/config/.claude/rules` alone. And everything in `rules/` is resident in every session, while
today `WORKFLOW.md` is linked rather than imported and a consuming monorepo deliberately does not
import `INITIALIZATION.md` at 13.4 KiB. So the hook populates `rules/` with what must govern every
turn and leaves the rest at a readable path for linking. **What lands there is derived state, not a
copy** — rewritten on every boot like the generated Dockerfile already is, and never edited in
place.

**`CLAUDE.md` and `AGENTS.md` ship in the bundle and are written into the project**, which is what
makes a project need nothing but this extension. They are written **when absent and never over
somebody's work**: both are tracked in git and carry a project's own standing answers — this
extension's own is one, and the reference monorepo's is 20 KiB of them — so copying over them is
destructive in a way the generated configuration is not. The pattern is already in this codebase,
in `devcontainer.ts`: *anything else, including a file that cannot be parsed, is somebody's work,
and the open refuses rather than overwriting it.*

**What does not change.** Pair Programming Mode, English, MIT, the Dev Containers extension as the
load-bearing non-free dependency, and every isolation constraint: no ssh-agent, gpg-agent, X11, host
git credential helper or host gitconfig crossing into the container, Workspace Trust left on, and
the agent unable to write what runs outside its jail. This amendment changes who delivers the image,
not what the image is allowed to do.

**And the base-replacement clause below has already fired.** "Replacing the image's base" is listed
as a thing that would change this charter, in the present tense, describing a base that is no longer
there: template `v5.0.0` moved it to `ghcr.io/linuxserver/baseimage-debian:trixie`. The clause was
right that it reopened every ownership decision — that is what the epic was — and it is rewritten
below as what it now guards rather than as a prediction.

### Amendment, 2026-10-01 (second)

**Two non-goals fell, and they were not small ones.** This charter said *"Removing code-server from
the image. It stays, as a fallback reachable when someone asks for it"* and *"Building images.
`.code-server/setup` remains the thing that composes the Dockerfile and builds"*. The objective is
now that the extension does both: open, build, and leave no code-server in the image. Each is its
own epic, neither is started until the epic in progress closes, and the sentence that kept the
first release to one flow is unchanged — replacing `start` is a one-for-one swap, and anything more
makes the comparison dishonest.

**What is being given up, said plainly.** The reason code-server was kept was that it is a way in
when the other way fails: if the Dev Containers extension breaks, is relicensed, or the host editor
will not attach, a browser against an unauthenticated loopback port still reaches the workbench.
Removing it removes that. The fallback that remains is `docker exec` and a terminal, which is not
an editor. This was traded knowingly, not overlooked.

> **Corrected on 2026-10-02 by the SRS's sixth amendment.** The paragraph below is right that those
> five things come from the base and are installed nowhere in the template, and it misleads by
> omission: LinuxServer publishes the base *without* an editor, and the code-server image is built
> on it. So the work is a changed `FROM` plus removing what the template does for code-server — not
> a reimplementation of five mechanisms. The estimate was the expensive reading of a true sentence.

**What is being signed up for, measured rather than estimated.** code-server is not installed into
the image, it *is* the image. From the one line that says so, `FROM
lscr.io/linuxserver/code-server:4.129.0`, five things arrive that the template installs nowhere:
s6-overlay (`/etc/s6-overlay/s6-rc.d/` holds both services), the `abc` user, `PUID`/`PGID` — which
is what `overrideCommand: false` exists to preserve — `/config` as the bind-mounted home, and the
`cont-init` mechanism that four hooks use, two of them written during this epic. A comment in
`core/Dockerfile.frag` records that *"LinuxServer's init rewrites abc's numeric uid"*. So the work
is a base-image replacement, and "Replacing the image's base" is now listed above as a thing that
would change this charter again.

**Order, recommended rather than decided:** code-server out first, the build absorbed second.
`setup` is a working shell script on the host and keeps working while the image moves under it;
changing the builder and the thing it builds in the same breath removes the one stable reference
point. The build epic also carries a problem the SRS already names — a project with no image cannot
have its stacks analysed by an agent, because the agent runs inside the image — and that is easier
to solve against a settled image than a moving one.

**One thing in flight acquires an expiry.** Story 4's rule for choosing extension identifiers reads
*"the extension published by the language's vendor when there is exactly one unambiguous candidate;
otherwise the same identifier the `code-server` list already installs"*. The second half points at
a list that is now scheduled to disappear. The story is not reopened for it — the list exists until
that epic ships — but the rule needs a different anchor before it does, and the epic that removes
code-server owns that.
