# Epics and stories

## Epic: the host editor replaces the launcher

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

## Epic: the editor composes and builds this project's image

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

## Epic: the extension carries the image

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

**The flow this epic delivers**, as described by João Lima on 2026-10-02. A panel with two entries,
and the second is the whole of the first after its scaffolding step:

| | |
|---|---|
| **New project** | ask the stacks and versions, whether to use `ai-memory`, and where the project goes → write the scaffolding and initialise git → compose, build, and reopen the host editor in the container |
| **Open project** | choose the folder → a manifest there means compose and build for it → no manifest means the same stack panel the new-project flow uses |

**It merges three epics that were named separately** — *starting a new project*, *adopting the
template into an existing project*, and this one — and the charter's non-goal *"the other two
flows… are later epics"* falls with it. *The agents screen* stays out.

**And it deletes the hardest part of adoption.** That epic was described here as "stack detection by
heuristic on the host, confirmed by the user". The flow asks instead: no manifest means the stack
panel, the same one a new project sees. There is no heuristic to be wrong, and nothing to confirm.

**Three things the flow needs that no requirement covered.**

`remote-containers.reopenInContainer` — already what this extension invokes — **takes no folder and
acts on the current window.** So the new-project flow is two-phase by construction: scaffold, then
`vscode.openFolder`, which restarts the extension host and discards everything in memory, then hand
over on activation in the new folder. The handoff has to survive that reload and must not be written
into the project, which is what extension-scoped state is for. **The compensation is that the flows
converge**: once the scaffolding exists, creating *is* opening, and there is one path rather than
two.

**The extension stops being scoped to a project.** It activates today on
`workspaceContains:.code-server.stack.json`; a panel offering to create a project has to exist with
no folder open at all, which means `onStartupFinished` and loading in every window on that host.
Accepted, with activation doing the least it can — register the view and nothing else. The cost is
startup weight in unrelated windows, not wrong behaviour.

**FR-23 is reversed.** It refuses a project whose image does not exist, naming the command that
builds it. The flow builds it. That was correct while building was somebody else's job and is not
once FR-81 moves composition here.

**The order is fixed by what cannot be verified until the CI exists.** FR-87 comes first: moving
4629 lines of shell into a repository that cannot build an image means every later story lands
unverified, and "it worked in the other repo" is not a result. The panel comes after the
capabilities it offers exist, because a button for a thing that is not built yet is a worse state
than no button.

| # | Story | Why in that order |
|---|---|---|
| 1 | the image builds here | FR-87 — nothing below is verifiable until it does |
| 2 | the bundle carries the image's content | FR-81, FR-82 — needs the builds to prove the move changed nothing |
| 3 | the extension composes and builds | FR-81 — needs the content to compose from |
| 4 | a project needs nothing but the extension | FR-83 — the files it writes, and refusing to overwrite |
| 5 | the documents arrive with the image | FR-84, FR-85, FR-86 — the only story needing a container to accept |
| 6 | opening a project the extension chose | FR-88, FR-89 — folder selection, build-on-open, and the convergence of the two flows |
| 7 | creating a project from nothing | FR-90, FR-91 — scaffolding, git, and the handoff across the reload |
| 8 | the panel | FR-92 — last, because it is the entry to everything above |

**Story 1 is where the template repository stops being the authority** and is the one to grill
hardest: it is a CI move, and a CI move that silently drops a job leaves a guard that reports
nothing. Each of the thirteen guards and each stack's in-image assertions has to be observed running
here, by name, before the archive.

## Epics named but not decomposed

Named so the first release does not close the door on them. None has stories until it is grilled,
and none starts before the epic above closes. **Two of them stopped being optional on 2026-10-01**
— see the charter's second amendment, which is where the reasoning and the cost are recorded.

- **The image stops being code-server's** — **decomposed and shipped** in template `v4.0.0` and
  `v5.0.0`. It is no longer in this list. The fallback it gave up — a browser against a loopback
  port when the Dev Containers extension will not attach — is gone as predicted, and was not
  needed.
- **Absorbing stack selection** — **decomposed below**, as *the editor composes and builds this
  project's image*. It is no longer in this list.
- **Starting a new project** — **merged into the epic above** by the flow of 2026-10-02, as
  *creating a project from nothing*. It is no longer in this list.
- **Adopting the template into an existing project** — **merged into the epic above**, as the
  no-manifest branch of *opening a project the extension chose*. The heuristic detection it was
  specified around is deleted rather than built: the flow asks the question a new project answers.
- **The agents screen** — **decomposed, and not grilled**; see
  `docs/PLANNING/the-agents-screen/`. Connecting an agent once, renewing on request, and where each agent's
  credentials live.
