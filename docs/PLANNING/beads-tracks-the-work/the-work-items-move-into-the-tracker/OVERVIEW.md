# Story: The work items move into the tracker

| | |
|---|---|
| **Epic** | `beads-tracks-the-work` |
| **Date** | 2026-10-06 |

## Summary

Every epic, story and task moves into the tracker and its document is deleted. The scenarios of a
story move with it. The rules that say where scenarios live are amended, in both languages.
FR-117, FR-120.

## What moves, measured

| | |
|---|---|
| epics | 5 |
| stories | 14 |
| tasks | 25 |
| `.feature` files | 14 |
| **total** | **59 files, 285 KB** |

**285 KB is not fifty-nine rows of status.** It is why story 1 is first, what a change deliberately
does not do, which measurement corrected which assumption, and what a failure scenario is covered
by. That prose is the thing this repository has spent itself on, and it is what a migration can
quietly fail to carry while reporting fifty-nine successes.

## This is the first destructive story this repository has had

Nothing before it deleted what it replaced. The image moved and the template was archived, not
erased; the launcher was retired with a notice; the manifest was renamed with its contents read back
before the old name was unlinked.

**Here the documents go.** `git log` keeps them, and that is worth exactly as much as a deleted file
is ever read. So the fifth scenario — *nothing is only in the history* — is not a formality: it is
the one that says the migration carried content rather than structure.

## What the `.feature` files cost, and the decision

The inherited rules say acceptance criteria *"live beside their story, at
`docs/PLANNING/<epic>/<story>/<story>.feature`"*, and **the image ships a Gherkin extension for that
reason.** Moving them into the tracker gives up two things:

- the editor support those files have, which is why the extension is in the image;
- the door the rules deliberately leave open — that a task may wire a Gherkin runner so *"the same
  `.feature` becomes the acceptance test"*.

**The operator chose to move them anyway, and to amend the inherited rule rather than break it
quietly.** The rule becomes two places rather than one: beside the story, or in the tracker when a
project has one. That keeps it true for the projects that never opt in — which is most of them, and
which FR-101 requires.

**In both languages.** `docs/agent/en/` and `docs/agent/pt-BR/` are checked against each other, and a
rule corrected in one is two different sets of rules.

## Acceptance criteria

Eight scenarios in
[`the-work-items-move-into-the-tracker.feature`](the-work-items-move-into-the-tracker.feature).
**This is the last `.feature` file this repository writes beside a story** — the behaviour it
describes is what moves it.

**One is `@manual`, and it is the only one that matters.** A migration can carry every field and
still lose what the documents were for: an argument that still reads as an argument. Fifty-nine items
of correct structure prove nothing about one paragraph of reasoning, and no assertion closes that
gap.

## Out of scope

- **The board.** Story 3. A board over a half-migrated tracker shows a project that does not exist,
  which is why this comes first.
- **The charter and the SRS.** They stay markdown, reviewed in a pull request — FR-104, and the
  criterion is where a document stops changing.
- **Anything that reads the tracker.** No rule telling the agent to work from it; that is story 4.

## Tasks

Written after this gate, not before.

## Outcome

Filled in when the story closes.
