# Epic: the extension carries the image

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
| **New project** | ask the stacks and versions, whether to use Beads and `ai-memory`, the private journal repository when Beads is on, and where the project goes → write the scaffolding and initialise git → compose, build, and reopen the host editor in the container |
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
