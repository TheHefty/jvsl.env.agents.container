# Story: The image carries bd

| | |
|---|---|
| **Epic** | `beads-tracks-the-work` |
| **Date** | 2026-10-05 |

**No status row, and that is the point.** FR-104 takes status out of markdown and FR-109 enforces it.
This story is what makes a tracker exist to hold it instead, so it is the first document written
without one. Its state is in `bd` once story 2 puts it there, and until then it is in the pull
request.

## Regrilled on 2026-10-05, the day it was agreed

**This story was agreed and then invalidated by a reversal in its own epic.** Its first scenarios
asserted `--stealth` and *"Nothing is written into the repository"*; FR-116 reverses both, because
the work items' content now lives in the tracker and therefore has to be versioned.

The scenarios are rewritten rather than edited. **A scenario patched to agree with a new decision is
a scenario that describes what was built** — and the whole value of agreeing them first is that they
describe what was wanted.

What did not change is the `@manual` scenario and the reason for it, which was a measurement rather
than a decision.

## Summary

A project that opts in gets `bd`, with what the tracker holds versioned alongside the project and
the agent's sandbox able to reach it. A project that does not opt in is untouched. FR-100, FR-101
and FR-116.

## Why it is first

**Nothing below it is verifiable without it.** Stories 2 through 5 move work into a tracker, take
status out of twenty documents, change what the agent is told to do, and add a question to a panel —
and each of those is a claim about a tool that has to be there to be wrong about.

**And it changes nothing about how anybody works**, deliberately. Installing a tool and changing a
method are two decisions. A project with no opt-in sees no new file, no new process and no wider
sandbox; a project that opts in gets a database and nothing that reads it yet.

## What changed again on 2026-10-05, after the regrill

**FR-103 is struck and FR-116 is amended**, both before any code.

`BEADS_DIR` and its read-write map asked for something that putting the tracker inside the repository
already provides: the workspace is mapped read-write by `ai-jail`, and `bd` finds its database by
walking up from the working directory. **The `@manual` scenario it justified changed with it** —
there is no variable left to go missing, and what remains is the narrower claim that the agent's walk
lands where a person's does.

And the export goes to a path of ours rather than into `.beads/`, because `bd init` writes that
directory's `.gitignore` itself and the Beads project ignores all of it. Fighting the tool there
buys nothing; exporting elsewhere costs a step.

**The format follows the requirement, stated plainly by the operator:** *"se precisar trocar de
máquina ou baixar um repositório de novo, poder continuar de onde parou"*. Machine, not tooling.
An earlier draft argued for rendered Markdown because it survives the tool disappearing — which
nobody had asked for, and which is the second time in one day a design question was answered
before the purpose was.

## The one thing this story can get silently wrong

**A walk that lands somewhere else succeeds about the wrong database.** FR-103 used to require a
variable *and* a map,
and the reason is measured rather than argued: `AI_MEMORY_DATA_DIR` is not forwarded into the
sandbox, so a hand-run `ai-memory` there resolves `/config/.local/share/ai-memory` while the server
its own boot hook started serves `/config/ai-memory`. The installed hooks escape it only because each
has its path baked into the command.

A missing map fails loudly and gets fixed. A missing variable reports success, which is why the
`@manual` scenario exists and why it is the only one that matters.

**The weight of that scenario was measured on 2026-10-05, not assumed.** Two defects surfaced that
day which only a person at a real host could have found: an extension rename changed the extension's
identity, so an older copy stayed installed and offered dead commands under a plausible name; and
`HOME` is declared nowhere, so tools inside the container resolved `/root` while `core/booted.test.sh`
stayed green over it. Neither was visible to any test. A story whose correctness turns on what an
agent reaches inside a sandbox is not a story to hand entirely to CI.

## Acceptance criteria

Eight scenarios in [`the-image-carries-bd.feature`](the-image-carries-bd.feature). **One is
`@manual`**, for the reason above.

**The scenarios name no mechanism.** Whether opting in is a marker file or a field in the manifest the
extension already writes is settled in the task design, not here — and the two differ in a way worth
deciding deliberately:

- **A marker file**, as `.ai-memory.toml` is. Symmetric with what exists, readable by a boot hook with
  no parsing, and a second file at the project root whose name `bd` itself does not recognise.
- **A field in `.code-server.stack.json`**, which the extension already writes and already asks
  questions to fill. One file instead of two, and the hook needs `jq` — which the image has — to
  read it.

## Out of scope

- **Anything that reads the tracker.** No rule telling the agent to use it, no panel entry, no
  migration of existing work. Those are stories 2, 4 and 5.
- **`beads-mcp`.** The epic defers it until there is a measured reason; it is a PyPI package and
  would bring Python.
- **`--server` mode.** The engine is embedded and single-writer, which is what one project in one
  container needs.
- **Moving anything into the tracker.** This story makes one exist; story 2 fills it. A tracker with
  the image's half done and the content's half not is the state the board must never be built over.

## The cost, named

**50.8 MB compressed** for the linux-amd64 release, because the storage engine is compiled into the
binary. It becomes the largest single artefact the image fetches. Accepted, and recorded here so that
a future bump is read against a number rather than a feeling.

## Tasks

| Order | Task | Status |
|---|---|---|
| 1 | [`tasks/the-tracker-exists-when-asked-for.md`](tasks/the-tracker-exists-when-asked-for.md) | Designed, at its gate |

**What the design settled, and the operator decided on 2026-10-05:** opting in is a field in the
manifest the extension already writes, not a second marker file; the boot hook runs `bd init` as
`abc` rather than as root; and the export is a command somebody runs rather than a git hook.

**The third carries a risk the design names rather than solves.** The requirement is to carry on from
where you left off on another machine, and a manual export satisfies it only when somebody
remembered — the moment that is discovered being the new machine. A hook, and a CI job that made
forgetting loud, were both offered and declined. The risk is carried knowingly.

## Outcome

Filled in when the story closes.
