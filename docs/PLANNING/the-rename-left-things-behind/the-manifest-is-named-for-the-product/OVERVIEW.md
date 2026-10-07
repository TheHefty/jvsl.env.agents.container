# Story: The manifest is named for the product that reads it

| | |
|---|---|
| **Epic** | `the-rename-left-things-behind` |
| **Date** | 2026-10-05 |

## Summary

`.code-server.stack.json` becomes `.agent-container.stack.json`. The extension activates on both,
renames its own file when it finds only the old one, and refuses to touch anything it does not
recognise. FR-110, FR-111, FR-112, FR-113.

## The rename is the easy half

**Forty-nine occurrences across twenty-nine files is a sweep. What makes this a story is the other
two things.**

### The name is in two regimes, and one of them is how a sweep goes wrong

Measured, not estimated:

| | |
|---|---|
| `MANIFEST` in `extension.ts:47` | a **module-private** constant, used seven times inside that file |
| `CONFIG_PATH` in `open.ts:7` | **exported**, used across three files — the pattern that worked |
| the bare literal | `build.ts:162`, `scaffold.ts:62`, `extension.ts:541`, and prose in several messages |

So three source files spell the name out while a constant for it already exists, in another file,
unexported. **A sed over forty-nine occurrences that misses one leaves a path looking for a file
nobody writes any more — and nothing fails.** That is this epic's own observation happening inside
the change meant to end it.

The story therefore consolidates before it renames: one exported constant, the literal surviving
only where it must, and a guard that holds it there. `package.json` is the one place it must survive
— activation is data, read before any of this extension's code runs, so it cannot be a variable.
That is also why the second scenario exists: a name that appears twice by necessity is a name whose
two copies have to be checked against each other.

### It deletes a file in somebody's repository

This extension's standing rule is that what it did not write is somebody's work — FR-83 refuses to
overwrite instruction files, FR-91 refuses to scaffold into a directory that is already a repository.
Story 1 has it remove a tracked file.

**The rule survives because the manifest is its own.** It is written by the configure flow; it is
recognised by parsing rather than by its name; and a file it cannot parse is not its own however it
is named. FR-113 is that line, and three scenarios draw it: both names present, a file that does not
parse, and the plain case.

## Acceptance criteria

Eight scenarios in
[`the-manifest-is-named-for-the-product.feature`](the-manifest-is-named-for-the-product.feature).
**Two are `@manual`.**

The first of those is the one that cannot be automated here at all: **activation happens before any
of this extension's code runs**, so a test that runs has already passed the question it was asking.
Whether a real project carrying the old name wakes the extension is observable only by opening one.

The second is a judgement rather than an assertion: a file in a tracked repository changed without
being asked for, and whether the message about it reads as helpful or as alarming is not something
an assertion settles.

## Out of scope

- **The older copy of this extension**, which is story 2.
- **Any other file named for the old product.** This is the manifest only; the image's content and
  the volume name are named after the project rather than the product.
- **Removing the old name's support.** When the two-name period ends is a decision with a date, and
  it is not this story's to make.

## Tasks

Written after this gate, not before.

| Order | Task | Status |
|---|---|---|
| 1 | [`tasks/the-name-is-resolved-once.md`](tasks/the-name-is-resolved-once.md) | Shipped in #95 |

**What the design settled, and the operator decided on 2026-10-05:** the name is resolved **once, at
activation**, so no other code learns that two names ever existed; and support for the old one is
removed in **2.0.0**, said at the resolving function and in the README rather than only in a document
somebody has to remember.

## Outcome

Filled in when the story closes.
