# Story: The board shows them

| | |
|---|---|
| **Epic** | `beads-tracks-the-work` |
| **Date** | 2026-10-06 |

## Summary

A page in the editor shows what the project's tracker holds, in two views — columns by state, and
the hierarchy as a tree — with each item's full text a click away. Proposals stand apart from agreed
work and are read there before the operator answers. The page reads, and writes nothing. FR-118 and
FR-119.

## Why it exists

**It is the epic's purpose, in the operator's words:** *"preciso de lugar pra ler, quando aprovar eu
venho aqui e digo aprovado"*. Everything else in the epic is there so this page has something true
to show.

**That is also why drafts moved into the tracker on 2026-10-06.** Story 4 had first kept drafts in
the conversation, which left the board showing only what was already agreed — the opposite of what
it was for. FR-106 was amended the same day: a draft is an item labelled `proposed`, deferred so
nothing treats it as work, until the operator agrees it.

## What was measured before it was written

**The extension runs on the host.** With a window connected to a project's container, the Extensions
view lists Agent Containers under "Local - Installed" only, and active. The tracker lives in the
container. So the page reads across that boundary, through the container's own bd — the version the
image pins — and a stopped container is said rather than worked around.

## What the operator decided

| | |
|---|---|
| **a stopped container** | the page says so and shows no items. No snapshot on the host: a stale board that looks current is the worse failure |
| **the views** | both, in tabs: columns by state, as on a Trello board, and the hierarchy as a tree. One reading feeds both |
| **when it reads** | when it opens and when asked. It does not poll |

## Acceptance criteria

Thirteen scenarios in [`the-board-shows-them.feature`](the-board-shows-them.feature). **Two are
`@manual`**: whether the board reads well, and whether it is where reading happens before approval.
The second is the epic's purpose, observed rather than asserted.

**One is about safety rather than function.** An item's text is content somebody wrote, and the page
renders it, so a script or a remote load inside it must not run.

## Out of scope

- **Writing anything.** No approval button, no status change, no edit. FR-118.
- **The migration.** Story 2. A board over a half-migrated tracker shows a project that does not
  exist, which is why this story is third.
- **How proposals are made.** Story 4's second task. This page only shows them.

## Tasks

| Order | Task | Status |
|---|---|---|
| 1 | [`tasks/a-page-reads-the-tracker-through-the-container.md`](tasks/a-page-reads-the-tracker-through-the-container.md) | Designed, at its gate |

## Outcome

Filled in when the story closes.
