# Task: the name is resolved once

| | |
|---|---|
| **Story** | `the-manifest-is-named-for-the-product` |
| **Date** | 2026-10-05 |

## Summary

One exported constant for `.agent-container.stack.json`, one function that resolves which name a
project actually has, called once when the extension wakes — and a guard that keeps the literal from
coming back. Support for the old name is removed in **2.0.0**.

## Problem

The manifest is named `.code-server.stack.json`, after a template that is archived and absorbed. It
is the one file of all this that lives in every project's repository, and it is declared as an
activation event — so a project that has it is the only kind of project this extension currently
wakes for.

**And the name is in two regimes**, which is what makes the obvious fix dangerous:

| | |
|---|---|
| `MANIFEST`, `extension.ts:47` | module-private, used seven times inside that file |
| the bare literal | `build.ts:162`, `scaffold.ts:62`, `extension.ts:541` |
| `CONFIG_PATH`, `open.ts:7` | exported, used across three files — what this should look like |

Forty-nine occurrences across twenty-nine files. **A sweep that misses one leaves a path looking for
a file nobody writes, and nothing fails** — which is the exact defect shape this epic exists to end,
reproducing itself inside the change meant to end it.

## Proposal

**Three parts, and the first has to land before the second is safe.**

1. **Consolidate.** Export `MANIFEST` the way `CONFIG_PATH` is exported, and make `build.ts`,
   `scaffold.ts` and `extension.ts:541` use it. No rename yet: this step is a refactor whose tests
   all pass before and after, and it is what makes step 2 a one-line change instead of a sweep.
2. **Rename**, and add the second activation event.
3. **Resolve once, at activation.** A function over what is on disk, returning which name this
   project has — and, when it has only the old one, performing the rename and reporting it. Every
   later read uses the resolved path; **no other code learns that two names ever existed.**

**`package.json` keeps a literal, and it must.** Activation is data, read before any of this
extension's code runs. So the name exists twice by necessity, and a guard asserts the two agree —
the shape `scripts/command-names-are-current.test.sh` already established: take the truth from the
manifest, hold the source to it.

**Removed in 2.0.0.** `0.3.0` today, `1.0.0` proposed; the next major is where the second path goes.
Said in the code at the function that resolves, and in the README's upgrade section, so it is not
only in a document somebody has to remember to read.

## Three worst failure scenarios

**1. The rename half-completes and the project has neither name.** The new file is written and the
old one deleted, or the delete runs first and the write fails — and a project ends up with no
manifest at all. Worst of the three because the extension then does not wake for that project, so it
cannot report what it did: the damage and the inability to describe it arrive together.

*Covered by:* writing the new file, reading it back and comparing it against what was parsed from the
old one, and only then unlinking. Never delete first. A failure at any step leaves the old file
untouched and says so.

**2. The resolved name goes stale.** The name is resolved once at activation — which is the point —
so a project whose manifest is renamed, deleted or created by hand afterwards has every later read
pointing at a path that no longer describes it. The symptom is defaults being used silently: limits
nobody chose, applied with no error.

*Covered by:* the existing `createFileSystemWatcher` already watches the manifest; it watches the
resolved path and re-resolves when that path appears or disappears. The test is that resolution runs
again after the watcher fires, not that the first resolution was right.

**3. Activation stops matching.** The sweep removes or mistypes `workspaceContains:` for the old
name, and a project carrying it never wakes the extension. **Nothing can report this**, because
nothing runs — it is the epic's own failure mode, and the reason the story's first scenario is
`@manual`.

*Covered by:* the guard comparing `package.json`'s activation events against the names the source
knows, so a missing or mistyped event fails a test rather than a person's afternoon. The guard
cannot prove the editor honours it, which is what the `@manual` pass is for.

## Blast radius

- **Every project with a manifest**, which is the only kind this extension wakes for today.
- **29 files, 49 occurrences** — but after part 1, the rename itself touches the constant, the
  activation events and the documents.
- **`core/compose-dockerfile.sh` reads `STACK_MANIFEST`**, a path handed to it by the extension
  rather than a name it knows. It needs no change, and that is worth stating because a sweep would
  have changed it.

## Alternatives considered

- **Teach every read about both names.** Rejected: it spreads the dual path across four files and
  makes removing it in 2.0.0 a second sweep with the same hazard as this one.
- **Rename only on an explicit command.** Rejected by the operator: nothing changes in a repository
  unasked, but the old name then survives indefinitely in anybody who never runs it, and the second
  path never ends.
- **Keep both names forever.** Rejected as a decision nobody would make deliberately — it is how a
  compatibility path becomes part of the product without anyone choosing that.

## Verification

- **Resolution is a pure function** over what is on disk: which names exist, what parses. Unit
  tested, including both-present and does-not-parse.
- **The guard** asserts one definition and that `package.json`'s activation events match it. Written
  first and observed failing against the literal in `build.ts`.
- **The two `@manual` passes** the story names: that a real project with the old name wakes the
  extension at all, and that the message about a renamed file reads as helpful rather than alarming.

## Open questions

None. The two that existed — where the rename happens, and when the second name goes — were settled
by the operator on 2026-10-05: once at activation, and 2.0.0.

## Outcome

Filled in when the task closes.
