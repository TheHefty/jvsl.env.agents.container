---
status: Done
story: the-editor-composes-and-builds/the-editor-asks
epic: the-editor-composes-and-builds
pr: 26
depends-on: [the-questions-produce-a-manifest]
---

# Task: the-view-shows-what-is-selected

# Summary

A tree in the Explorer showing the selected stacks with their versions and the limits, with the
configure command on its title.

**No design section of its own.** Nothing here was a trade-off the story's gate had not already
settled: the view was chosen over a status bar item and a palette-only command, and what is left is
where to put it and what to show in three states. What this document records is the decisions taken
while writing it and what they cost.

## Decisions taken while writing it

**In the Explorer, not in its own activity-bar container.** An icon in the activity bar is a permanent
claim on the narrowest strip of screen the editor has, and this is one small tree about the project
that is already open. The Explorer is where project-shaped things live. Reversing it later is a
`viewsContainers` entry and a move.

**Three states are kept distinct, and collapsing any two sends somebody to the wrong place:**

| state | row | why not merged with the others |
|---|---|---|
| no stacks available | *Template not checked out* → `git submodule update --init` | `.code-server/` exists and is empty after a clone without `--recursive`; an empty tree reads as a broken extension |
| no manifest | *Not configured yet* → runs the configure command when clicked | nothing has been answered |
| a manifest selecting no stacks | *No stacks selected* → `the core image alone` | a real selection that produces the core image; calling it unconfigured sends somebody to answer questions they already answered |

That third one is the easy one to get wrong, and it is the one with a test watched failing.

**The manifest is watched, not read once.** A person may edit that file by hand — `setup` reads it
either way — and a view that refreshed only when this extension wrote it would be confidently wrong
rather than merely stale.

**Unknown manifest keys are not shown.** They survive on disk, which is the questions' job; inventing a
row for each would make this a JSON viewer with worse formatting.

## Tests

Seven, in `src/view.test.ts`, over `viewItems` — a function from what is on disk to the rows. The tree
provider reads the disk and turns rows into `TreeItem`s and holds no decision, for the same reason the
questions do not: a test asserting a `TreeItem` was constructed is a test of the constructor.

**Two were watched failing against a deliberately wrong implementation** that collapsed
*uninitialised* into *not configured* and treated *selected nothing* as unconfigured — the two
confusions the states exist to prevent.

## Three worst failure scenarios

| # | Scenario | How it manifests | Test that catches it |
|---|---|---|---|
| 1 | An uninitialised submodule shows as an empty tree | Reads as a broken extension. Somebody looks for a bug here instead of running one command, and nothing on screen mentions the submodule | the uninitialised row, asserted to name `submodule update --init` |
| 2 | A project that deliberately selected no stacks is reported as unconfigured | It sends somebody to answer questions they have answered, and the answer they give is the one already there | the row saying the core image alone, asserted to be distinct from the empty state |
| 3 | The view goes stale after a hand edit | It shows a selection that is not the one `setup` would build from, confidently, with no indication it is out of date | Not unit-testable: it is a `FileSystemWatcher` on the manifest, and the `@manual` scenario is where it is seen working |

## Outcome

Implemented in #26, 86 tests in all. The story's `@manual` scenario — whether the tree reads clearly
and shows the numbers a person expects — is the thing none of this covers, and it is the reason that
scenario exists.
