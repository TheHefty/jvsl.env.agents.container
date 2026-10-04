---
status: Done
story: the-extension-carries-the-image/the-documents-arrive-with-the-image
epic: the-extension-carries-the-image
pr: 60
---

# Task: the-documents-move-here-with-their-parity-check

## Summary

`docs/agent/` moves into this repository with `check-parity.sh`, its CI job, and the guard that story
1 deferred. Nothing delivers them yet — that is the next task.

## What moves, measured

| | |
|---|---|
| files | **27** — 12 `en`, 12 `pt-BR`, `check-parity.sh`, `check-parity.test.sh`, `README.md` |
| what becomes resident later | `RULES.md` 20484 bytes + `MODES.md` 6104 = **26.6 KB in every session** |
| what must not | `INITIALIZATION.md` at 13764 bytes, which describes a moment that happens once |

**The 26.6 KB is the number to hold on to**, and it is the reason FR-86 exists. It is not a figure to
reduce by trimming the documents: the length is the argument, and a rule without its reason is a rule
that outlives its reason. It is a figure that says which two files go to `rules/` and which twenty-five
do not.

## Two jobs come back, and one of them was a promise

Story 1's third task removed two guards whose subjects had not arrived, and said: *"they return with
their subjects — `docs/agent/` in story 5, and the `setup` files in the epic's story 3."*

**`scripts/agent-docs-cite-real-files.test.sh` returns here.** Its subject is arriving, and it
asserted 0 citations without it.

**`scripts/no-whiptail.test.sh` never returns, and saying so is this task's job.** Its subject was
`setup`, `init` and `packages.sh` — and FR-81 did not move them here, it made them unnecessary. The
promise was made in good faith against a decomposition that has since changed. **A promise quietly
dropped is worse than one withdrawn out loud**, so it is withdrawn here with the reason: there is
nothing left for it to guard, and a guard whose subject will never exist is not deferred, it is
cancelled.

`agent-docs` also brings `check-parity.sh`, which is the whole reason the two language folders do
not drift. That job did not come with the pipeline because its test was not here.

## Three worst failure scenarios

**1. The documents arrive and nothing checks the two languages against each other.** `check-parity.sh`
exists because a rule corrected in `en` and not in `pt-BR` leaves two different sets of rules with one
name, and whichever a project reads is decided by its own configuration. Moving the documents without
the job is the one way this task can look complete and not be.

**2. A document cites a file that this repository does not have.** They cite
`core/cont-init/15-git-credential-helper.test.sh` and others as the shape to copy — which are here —
but also `setup.test.sh` and `packages.test.sh`, which are **not**, because FR-81 removed their
subject. `agent-docs-cite-real-files.test.sh` will fail on exactly that, and the fix is to correct the
documents rather than to loosen the guard. **That is a change to the normative documents, which is
`feat` rather than `docs`, and it needs saying rather than slipping through in a move.**

**3. The move is read as a fork.** These documents ship from the template to every project that bumps.
Bringing them here makes this repository their origin — and the template's copy becomes a copy that
nobody will edit and somebody will read. The archive is what resolves that, and it is the user's call
rather than this task's; what this task owes is to not leave two live origins without saying so.

## Verification

| Test | Asserts |
|---|---|
| `docs/agent/check-parity.test.sh` | the parity check can fail — it comes with the documents, with a CI job |
| `scripts/agent-docs-cite-real-files.test.sh` | every file a document cites exists here. Expected **red on arrival**, and the documents are what change |
| `every-test-has-a-runner.test.sh` | still green: two new test files, two new jobs |

## Out of scope

- **Delivering them** — the next task: the image carries them and a boot hook writes `rules/`.
- **Removing the `.code-server/` submodule** — the task after that, because `CLAUDE.md:32` imports
  `MODES.md` from it and the import cannot move before its target does.
- **Changing any rule.** Only citations change, and only where the cited file is gone.

## Outcome

Implemented in #60. 27 files, two CI jobs, 26 jobs in all with no orphans.

**Three predictions in this design were wrong, and the measurements are the useful part.**

**The history does not follow the paths.** This design said no second merge was needed because story
1 had already brought the template's whole history — true of the objects, **false of the paths**.
`git log docs/agent/en/RULES.md` shows **one** commit: checking files out of a merge's second parent
in a *later* commit does not connect them to the history they came from. What made `core/` work is
that it came **through** the merge. The fourteen commits are reachable as
`git log 58a8e42^2 -- docs/agent/`, and `docs/agent/README.md` says so, because a reader would
otherwise conclude the history was lost. **This is story 1's own third failure scenario — "the
history arrives and is not reachable from the paths" — reached from the other side.**

**The guard passed instead of going red, and my first explanation of why was unfair to it.** I read
the `grep '/'` in its extraction as a guard narrower than its purpose. It is not: its scope is cited
*paths*, which its comment states, and `packages.test.sh` with no directory is not one.

**But the documents did cite a file that is absent here** — four places across two languages.
`MODES.md` and `RULES.md` named `packages.test.sh` as the shape to copy, and FR-81 made it
unnecessary rather than moving it. Corrected to files that exist and have jobs, parity holding. A
change to normative documents, so `feat` rather than `docs`.

**And the move exposed stale premises rather than stale citations.** These documents describe a
project that consumes a template through a submodule — `.code-server/` paths, bump a pointer, rerun
`setup`, which repository's CI a test runs in. Under this epic a project installs an extension and
has no submodule. Correcting that is more than a move should do quietly; it is named in
`docs/agent/README.md` as this epic's work.

**One promise is withdrawn out loud.** `no-whiptail.test.sh` does not come back: its subject will
never exist, because FR-81 removed it rather than relocating it.

**And a mistake of my own, in the mechanics rather than the content.** The implementation commit
landed on local `master` because a `git checkout -b` failed silently in a chain whose `echo` reported
success regardless. Nothing reached the remote — `origin/master` was untouched — and it was moved to
a branch and rebased. **The fourth time in this epic that I acted on git state I had not verified**,
and the first where the guard was my own `&&` chain rather than a test.
