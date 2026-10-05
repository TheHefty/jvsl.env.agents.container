# Story: The image carries bd

| | |
|---|---|
| **Epic** | `beads-tracks-the-work` |
| **Date** | 2026-10-05 |

**No status row, and that is the point.** FR-104 takes status out of markdown and FR-109 enforces it.
This story is what makes a tracker exist to hold it instead, so it is the first document written
without one. Its state is in `bd` once story 2 puts it there, and until then it is in the pull
request.

## Summary

A project that opts in gets `bd` with its database on the project's own volume and the agent's
sandbox able to reach it. A project that does not opt in is untouched. FR-100, FR-101, FR-102,
FR-103.

## Why it is first

**Nothing below it is verifiable without it.** Stories 2 through 5 move work into a tracker, take
status out of twenty documents, change what the agent is told to do, and add a question to a panel —
and each of those is a claim about a tool that has to be there to be wrong about.

**And it changes nothing about how anybody works**, deliberately. Installing a tool and changing a
method are two decisions. A project with no opt-in sees no new file, no new process and no wider
sandbox; a project that opts in gets a database and nothing that reads it yet.

## The one thing this story can get silently wrong

**A missing variable succeeds about the wrong database.** FR-103 requires the variable *and* the map,
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

## The cost, named

**50.8 MB compressed** for the linux-amd64 release, because the storage engine is compiled into the
binary. It becomes the largest single artefact the image fetches. Accepted, and recorded here so that
a future bump is read against a number rather than a feeling.

## Tasks

Written after this gate, not before.

## Outcome

Filled in when the story closes.
