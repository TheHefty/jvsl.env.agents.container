# Story: The image builds here

| | |
|---|---|
| **Status** | **Done** |
| **Epic** | `the-extension-carries-the-image` |
| **Date** | 2026-10-02 |

## Summary

This repository builds and verifies the image it will ship. `core/`, `stacks/` and the guards
arrive, and the pipeline that proves they work runs here.

**The extension does not use any of it yet.** Bundling is story 2 and composing is story 3. What
closes this story is that the content is here and checked — nothing more, because nothing more can
be checked until it is.

## Problem

FR-87 says what the image contains is verified by image builds in this repository. Today it is
verified in another one, and this repository cannot build an image at all: a pull request here is
green in under a minute because it runs a typecheck, a unit suite, a bundle check and an
integration fixture.

So every story after this one would land on content whose behaviour nothing here confirms. **"It
worked in the other repo" is not a result** — not after that other repo's CI found, in the last two
days alone, a package rename, three absent compiler versions, an Ubuntu-only feed that installed on
Debian without complaint, and a base image that deletes `/usr/share/man` and breaks every JDK's
post-install. None of those were visible from reading the files.

## The risk this story is actually about

Not "will the build work". **A CI move drops a job silently.** A job that is gone does not fail; it
reports nothing, and a guard reporting nothing is indistinguishable from a guard that passes. The
13 guards and the in-image assertions are each there because they caught something, and losing one
costs nothing today and everything on the day it would have fired.

**So the move is guarded by a check written test-first against the move itself.** It compares every
tracked test file against the pipeline's definition and fails when one has no runner. Written
before the jobs are moved, it is red for twenty-nine files and goes green as they arrive — which
makes the move's own completeness the thing that turns the test green, rather than somebody's
reading of a diff.

**That check is not a grep, and the measurement says why.** Grepping the workflow for each test
file's path reports three of twenty-nine missing: `stacks/cpp/image.test.sh`,
`stacks/php/image.test.sh` and `stacks/python/image.test.sh`. All three run — they are invoked as
`stacks/${{ matrix.stack }}/image.test.sh`. A check that reports those as absent is a check
somebody learns to ignore, which is worse than not having it. Scenario 4 exists for exactly this,
and it was found by running the naive version before trusting it.

## Proposal

Four tasks, in this order:

1. **The content arrives.** `core/`, `stacks/` and `scripts/` are added, with history. No behaviour
   changes; the deliverable is that the trees are provably identical to what the other repository
   holds at its tag.
2. **The pipeline arrives and builds.** `core-build`, `core-booted`, `discover-stacks` and
   `stack-build` with its per-stack in-image step. The stack list is read from the tree.
3. **Nothing was dropped.** The guard above, written first and red, plus the remaining 13 guard
   jobs. This is the task that closes the story.
4. **The fast path.** `changed-scope.sh`, the per-job `if:`, and `ci-green.sh` that accepts
   `skipped` — so that a Markdown change still finishes in under a minute.

## What this costs, measured rather than estimated

| | |
|---|---|
| CI on a change touching the image | **6 minutes** — run `37030096331`, all 12 `stack-build` jobs in parallel, slowest `ruby` at 4 |
| CI today | under a minute |
| shell this repository takes ownership of | 4629 lines |
| guards | 1066 lines, 13 files |

**An earlier estimate in this chain was wrong and is corrected here.** The SRS's seventh amendment
speaks of accepting "one slow pipeline", and the PR that opened it implied twelve image builds would
make this repository's pipeline heavy. Six minutes is not heavy. What still justifies moving the
fast path is not the total but that a typo in Markdown has no business waiting for any of it.

## Decision this story needs, and cannot make by default

**Does the content arrive with its history, or as a copy?** A plain copy is one commit and loses
every message behind those 4629 lines. This project's own rules say the diff already says what
changed and the message is where *why* belongs — and these files are unusually dense in why: the
digest pin, the `mkdir -p /usr/share/man/man1`, the sury key, the four deleted Tauri libraries, each
with its reason in a commit rather than in a comment.

Recommended: bring the history. **Decided on 2026-10-02: bring it.** The cost is that this
repository's history becomes dual-rooted and `git log` shows two projects' commits interleaved.

**And the subdirectory this recommendation assumed turns out not to be needed**, which makes the
mechanism cheaper than proposed: `core/`, `stacks/` and `scripts/` have zero files here, so the
three names are free and the paths never change. Task 1 merges with `--allow-unrelated-histories`
and nothing is rewritten — original SHAs, and `git log core/Dockerfile.frag` with no `--follow`
and no rename detection. See the task for why `subtree` and `filter-repo` were both rejected on
that measurement.

## Out of scope

- **Bundling into the `.vsix`** — story 2. The content being in the repository is not the content
  being in the package, and `vscode:prepublish` has already been a source of a defect where version
  and behaviour could disagree.
- **Composing from the extension** — story 3. Until then composition stays
  `core/compose-dockerfile.sh`, and scenario 7 is the constraint that keeps the two from diverging:
  when the extension takes composition over, CI switches in the same change.
- **Archiving `jvsl.env.agents.code-server`** — after this story is green here, not as part of it.
- **`docs/agent/`** — it moves with story 5, which is where the documents get a delivery mechanism.
  Moving it earlier would put the normative documents in two repositories at once, which is the
  divergence the whole arrangement exists to prevent.

## Acceptance criteria

Seven scenarios in
[`the-image-builds-here.feature`](the-image-builds-here.feature), beside this file.
**None is `@manual`** — unusual here, and a property of the subject: this story is about what CI
does, so every claim it makes is one CI can be made to say.

## Tasks

Written after this gate, not before.

| Order | Task | Status |
|---|---|---|
| 1 | [`tasks/the-content-arrives-with-its-history.md`](tasks/the-content-arrives-with-its-history.md) | Done — #41 |
| 2 | [`tasks/nothing-was-dropped.md`](tasks/nothing-was-dropped.md) | Done — #43 |
| 3 | [`tasks/the-pipeline-arrives-builds-and-stays-fast.md`](tasks/the-pipeline-arrives-builds-and-stays-fast.md) | Done — #45 |

**The order changed at task 2, and the story's own prose is why.** The table first put the guard
third and the pipeline second; the prose beside it already said the guard is *"written before the
jobs are moved… which makes the move's own completeness the thing that turns the test green"*. A
guard written after the jobs is green on its first run and has never been seen failing for its own
reason.

**And task 4 collapsed into task 3.** "The fast path" cannot be a separate change: this
repository's `ci-green` fails on a skipped job, so the moment image jobs are gated on what changed,
every documentation-only pull request goes red. Gating, `ci-green.sh` and the jobs are one change
or none.

## Outcome

Filled in when the status leaves `Draft`.
