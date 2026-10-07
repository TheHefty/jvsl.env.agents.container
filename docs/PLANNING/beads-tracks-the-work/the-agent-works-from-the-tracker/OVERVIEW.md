# Story: The agent works from the tracker

| | |
|---|---|
| **Epic** | `beads-tracks-the-work` |
| **Date** | 2026-10-06 |

## Summary

The normative documents say how an agent uses the tracker: it reports what is unblocked, records
work the operator has agreed to, and closes items with a reason. It does not start work, and it does
not create items. FR-106.

## The line this story draws

**FR-106 is about starting, and it says nothing about recording.** That distinction is the whole
story, and it was settled by the operator on 2026-10-06:

| | |
|---|---|
| **reading** | `bd ready` says what has no open blocker. The agent may report it |
| **starting** | is a gate. The tracker knowing something is *possible* does not make it *next* |
| **recording** | work already agreed moves to in-progress and closes with a reason, without anybody typing it |
| **creating** | an epic, story or task only as a **proposal**: labelled `proposed`, deferred, invisible to `bd ready`, and work only after the operator agrees it (amended on 2026-10-06, so drafts reach the board). Besides proposals, only a debt the operator said yes to recording |

**The third of those is what makes a tracker worth having** rather than a second place to keep in
step by hand — which is what the markdown status tables already were, and why they are being removed.

**The fourth is where it would quietly stop being this project's method.** The chain is charter, SRS,
epic, story with its scenarios, task, code, each agreed before the next is written. An agent that
creates the next link because the tracker has room for it has replaced the chain with a backlog.

## Why it is fourth

Nothing can work from a tracker that has nothing in it, and a rule telling an agent to read one is
noise until story 2 has run. It is also the first story in this epic whose subject is **the
documents rather than the code** — what ships in the image to every project, in two languages.

## The rules have to stay true for projects without a tracker

The normative documents reach every project that bumps, and most will never opt in — FR-101 makes
the tracker opt-in on purpose. So this reads as *when a project has a tracker*, in the same shape
story 2 uses for where acceptance criteria live.

**A rule that assumes a tracker is false for most readers**, and a false rule in a shared document is
worse than a missing one: it is followed by nobody and trusted by everybody.

## Acceptance criteria

Ten scenarios in
[`the-agent-works-from-the-tracker.feature`](the-agent-works-from-the-tracker.feature). Added on
2026-10-06: a problem found along the way is recorded only after the operator's yes; and "Nothing is
created without a gate" became two scenarios about proposals, when drafts moved onto the board. **Two are
`@manual`**, and both are about behaviour over a session rather than about a document.

**A rule can be written correctly and followed badly, and nothing here can see the difference.** The
first watches for the failure this story exists to prevent — reporting and then starting. The second
asks the question that decides whether any of this was worth it: whether a week of closed items reads
as an account of what happened.

## Out of scope

- **The board.** Story 3 — and it is blocked on a measurement nobody has made yet.
- **Running the migration.** Story 2's script exists; running it deletes fifty-nine documents and is
  the operator's.
- **Anything about what the agent does outside the tracker.** The modes and the gates are unchanged;
  this adds where state is written, not who decides.

## Tasks

| Order | Task | Status |
|---|---|---|
| 1 | [`tasks/the-rules-say-how-to-work-from-the-tracker.md`](tasks/the-rules-say-how-to-work-from-the-tracker.md) | Shipped in #120. Its "drafts live in the conversation" is superseded |
| 2 | [`tasks/the-rules-say-how-a-proposal-is-made-and-agreed.md`](tasks/the-rules-say-how-a-proposal-is-made-and-agreed.md) | Shipped in #122 |

## Outcome

**Shipped, not yet closed.** Both tasks are merged: the rules in #120, and the proposal cycle in
#122. The rules are held by `scripts/tracker-rules-are-conditional.test.sh`, and every bd command
they name is run against the image's own bd by `core/image.test.sh`.

Still owed by hand: the two `@manual` scenarios, observed over a real session in a project that has
a tracker. They are the only test of whether an agent follows the rules.
