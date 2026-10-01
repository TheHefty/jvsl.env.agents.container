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
that stands up the container and connects the host editor to it, replacing the Tauri launcher the
template ships today. The constraint that makes it a project rather than a shortcut: moving the
editor out must not weaken the isolation the container exists for.

## In scope / out of scope

**In scope.**

- Opening a project that already carries `.code-server/`: generating its dev container
  configuration from `.code-server.stack.json` and the host's actual capabilities, standing the
  container up, and connecting the host editor to it as `abc` in `/config/workspace`.
- Enforcing isolation across that boundary — no ssh-agent, gpg-agent, X11, host git credential
  helper or host gitconfig reaching the container, and Workspace Trust left on.
- Deprecating `.code-server/start` and its Tauri window.
- Declaring, and verifying at runtime, the minimum template version this extension requires.

**Out of scope, deliberately.** Each of these is a thing a reader might reasonably assume is
included:

- **Hosts other than Linux.** WSL, macOS and Windows are not supported and are not designed
  around. WSL is the first candidate to revisit; the others are not.
- **Editors other than Microsoft's VS Code.** VSCodium, Cursor and Windsurf cannot use the Dev
  Containers extension this one depends on, and supporting them means reimplementing the remote
  attach against a proprietary protocol.
- **Removing code-server from the image.** It stays, as a fallback reachable when someone asks for
  it. Only the launcher is retired.
- **Building images.** `.code-server/setup` remains the thing that composes the Dockerfile and
  builds; a missing image is an error this extension names, not one it fixes. Absorbing that is
  named as a future epic in the SRS and is not scheduled.
- **The other two flows.** Starting a new project with an initialization interview, adopting the
  template into an existing project, and the agents screen are later epics. The first release does
  one thing: open a project that is already set up.
- **Agents other than Claude Code**, and any change to where agent credentials live.
- **Changes to the container image.** Those are the template's, in its own repository, under its
  own epic. This project depends on them and does not contain them.
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
  use only in Microsoft's own build of VS Code. It is the single piece of this stack that is not
  free software, and it is load-bearing: this project delegates the container lifecycle to it
  rather than reimplementing it. The dependency is declared hard, so installing on a build that
  cannot use it fails at install time rather than degrading in silence.
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

The sections above are as written at the gate and were not edited afterwards.
