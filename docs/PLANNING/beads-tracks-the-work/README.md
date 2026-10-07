# Epic: Beads tracks the work

**The work items stop being files, and gain a place to be read.**

The SRS carries the requirements (FR-100 to FR-109 and FR-116 to FR-121) and the epic's reasoning.
This directory carries the stories — and it is the last thing in this repository shaped like this,
because story 2 is what empties it.

## Grilled on 2026-10-05, and reversed the same day

**The first grilling settled the opposite split**: documents keep what was agreed, the tracker keeps
state. It was careful, it was measured, and it answered the wrong question — because nobody had said
what the thing was *for*.

What reversed it was one sentence from the operator:

> *preciso de lugar pra ler, quando aprovar eu venho aqui e digo aprovado*

**The requirement was a reading surface.** The first decomposition had assumed the requirement was
tracking, and everything downstream of that assumption — always stealth, documents stay, a guard
against status in markdown — was a correct answer to a question nobody had asked.

**That is worth recording rather than tidying away.** The grilling did its job: it produced a
coherent design fast enough that its wrongness was cheap. No code existed, one story had been agreed
and nothing built. The cost of the reversal was an afternoon of writing.

## What survived, and why those are different

The measurements survived; the decisions did not.

| measured | still true |
|---|---|
| the storage engine is embedded | no service, no resident memory, and 50.8 MB of image |
| `bd init` is explicit | which is the whole reason a boot hook exists |
| `--external-ref` exists | for an item that came from somewhere else |
| `bd dep tree` and `bd graph` exist | an earlier reading of the README said otherwise and was wrong |
| Beads ships `bd remember` | and it stays unused: `ai-memory` already holds knowledge |

**A decision made from a measurement is not as durable as the measurement.** Every reversed item was
a decision; every surviving one was something that was looked at.

## The split, and its criterion

**Where a document stops changing.**

| | |
|---|---|
| **charter, SRS** | stay markdown, reviewed in a pull request. Argued over, changed rarely, and changing everything when they do |
| **epic, story, task** | live in the tracker, markdown deleted. Worked on — read far more often than reviewed, and the reading had no home |

## What it costs

- **A work item has no diff in a pull request at all.** Since FR-116's amendment on 2026-10-06 the
  items travel by the tracker's Dolt remote rather than as a tracked JSONL, so a pull request no
  longer shows them. Accepted by the operator: the two documents that still need a readable diff are
  exactly the two that stayed. It was "reviewing becomes reading JSONL" until then.
- **The remote gains a `__dolt_remote_info__` branch**, which `bd dolt push` creates beside
  `refs/dolt/data`.
- **Stealth is given up, and the Azure DevOps case with it.** It existed so this could be used in a
  repository that is not the operator's to change. Always-tracked removes that until some later epic
  puts it back.
- **Two places hold one document for exactly as long as the migration takes.** Story 2 is written to
  be one change rather than a gradual one for that reason.

## Stories

| # | Story | Status |
|---|---|---|
| 1 | [the image carries `bd`](the-image-carries-bd/) | **Shipped** — both tasks (#117 for FR-121). Owed by hand: the `@manual` pass, and `bd dolt push` against GitHub on the first real push |
| 2 | [the work items move into the tracker](the-work-items-move-into-the-tracker/) | **Script shipped, not run** — running it is the operator's, after this repository opts in and its container is rebuilt |
| 3 | [the board shows them](the-board-shows-them/) | **Shipped** in #123. Seen on the operator's host in a connected window on 2026-10-07. Owed by hand: a board over real items, and the two `@manual` passes |
| 4 | [the agent works from the tracker](the-agent-works-from-the-tracker/) | **Shipped** in #120 and #122. Owed by hand: the two `@manual` passes |
| 5 | the guard holds the split | Not started |

**Story 1's scenarios are false now, in two places.** They were written under `--stealth` and assert
*"Nothing is written into the repository"* — FR-116 reverses both. It is regrilled rather than
patched: a scenario edited to agree with a new decision is a scenario that describes what was built.

**Story 3 is what the operator asked for, and it is third on purpose.** A board over an empty tracker
shows nothing, and a board over a half-migrated one shows a project that does not exist.

**What unblocked it, measured on the operator's machine on 2026-10-06:** with a window connected to a
project's container, the Extensions view lists Agent Containers under **"Local - Installed" only**,
and active. It runs on the host, as `extensionKind: ["ui"]` declares, and works in the remote window.
So the board runs on the host while the tracker lives in the container, and how it reads across that
boundary is the story's first design question.

## What this epic must not do

- **Keep a copy.** The markdown of a migrated item is deleted, not archived — two places holding one
  document is where a reader cannot tell which one the work followed.
- **Put approval on the board.** It stays a sentence the operator says. FR-118.
- **Become a service.** The board is part of an extension that already runs on the host and already
  has a panel. Nothing is started, served or logged into.

## Outcome

Open. Grilled twice, and once reversed.
