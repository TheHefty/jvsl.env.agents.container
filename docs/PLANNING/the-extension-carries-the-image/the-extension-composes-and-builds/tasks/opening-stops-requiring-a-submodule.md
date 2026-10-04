---
status: Draft
story: the-extension-carries-the-image/the-extension-composes-and-builds
epic: the-extension-carries-the-image
pr:
---

# Task: opening-stops-requiring-a-submodule

## Summary

FR-22's machinery is deleted. A project with no `.code-server/` opens.

## Problem, and it is a live contradiction rather than untidiness

Task 1 made the extension compose from what it carries and build its own image. **And a project
with no submodule still cannot be opened**, because `decideOpen` refuses first:

```
`.code-server/version.txt` could not be read, which almost always means the submodule
was never initialised — `git submodule update --init`. Nothing was written.
```

So the extension now builds an image for a project it then refuses to open, and the instruction it
gives is to initialise a submodule it no longer reads. **Every statement in that message is false
after task 1.**

This is the deletion the SRS's seventh amendment scheduled when it struck FR-22 and did not assign
it to a story. It belongs here: task 1 is what made the requirement false, so task 2 is where it
goes.

## What the measurement found still reaching into the submodule

| | |
|---|---|
| `src/template.ts:40` | `readTemplateVersion` reads `.code-server/version.txt` |
| `src/open.ts:105,117,132` | the three refusals — absent, unparseable, below the minimum |
| `src/diagnostics.ts:38` | the version line |
| `src/extension.ts:218` | *"No stacks found in `.code-server/stacks`… run `git submodule update`"* — **already false** after task 1, which reads the stacks the extension carries |
| `src/open.ts:170` | *"run `.code-server/setup` to rewrite it"* — **already false**; the questions rewrite the manifest |
| `package.json` | `templateMinVersion`, and the `workspaceContains:.code-server/setup` activation event |

The last two rows are the ones that matter most and were not in the amendment's list: **two messages
a person acts on are already wrong**, and a wrong instruction costs more than a missing one.

## Three worst failure scenarios

**1. Deleting the check removes a refusal that was catching something real.** FR-22 existed because
a project on an older template opened and got an editor with no extensions at all. **That risk does
not vanish, it moves**: the content now travels with the extension, so there is no second version to
disagree with — *provided nothing still reads the submodule*. The test is not "the refusal is gone";
it is that **no code path reads `.code-server/` for anything**, which is a stronger claim and the
only one that makes the deletion safe.

**2. A project that still has a submodule behaves differently from one that does not.** Every
project built on the template has one today, pinned to whatever it last bumped to. If any path
prefers it, those projects compose from one place and new projects from another, and the difference
is invisible. There is no fallback, and the assertion is about absence rather than about precedence.

**3. The refusals that remain give instructions that no longer work.** `open.ts` keeps several, and
two of them name `.code-server/setup`. After this task that path may not exist — and a person told
to run a script that is not there concludes the extension is broken, which is the opposite of what
a refusal is for.

## Verification

| Test | Asserts |
|---|---|
| `open.test.ts` | a project with **no** `.code-server/` opens, and the three version refusals are gone — the existing tests for them are deleted, not skipped |
| a new guard | **no file under `src/` names `.code-server/`** except in a comment recording that it used to. The repository-wide shape the template's own guards use, and the only form of scenario 1 that holds |
| `diagnostics.test.ts` | the detected output no longer claims a template version |
| `extension.ts`'s refusal | the no-stacks message names what the extension carries, not a submodule to initialise |

**The guard is the deliverable, not the deletion.** Deleting the lines is an afternoon; asserting
that nothing reads the submodule is what stops the next change from quietly adding a read back.

## Out of scope

- **Removing the submodule itself**, and `CLAUDE.md:32` which imports `MODES.md` from it — story 5,
  which is what replaces what it supplies.
- **The activation event.** `workspaceContains:.code-server/setup` is harmless while it is an
  alternative rather than a requirement: a project carrying only the submodule still activates, and
  that is the migration working. Story 4 owns it.

## Open questions

**One, and it is worth a decision rather than a default.** `package.json`'s `templateMinVersion`
loses its only reader. Deleting it is right, and it is also the field a future reader would look for
if the extension ever needed to refuse an incompatible *image* rather than an incompatible template
— which is a real possibility once the image is published rather than built. Recommended: delete it,
because a field kept for a use nobody has is a field whose meaning drifts, and the debt recording
its unverifiability can say where it went.

## Outcome

Filled in when the status leaves `Draft`.
