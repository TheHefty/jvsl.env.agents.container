# Story: The bundle carries the image's content

| | |
|---|---|
| **Status** | Draft |
| **Epic** | `the-extension-carries-the-image` |
| **Date** | 2026-10-02 |

## Summary

`core/` and `stacks/` travel inside the `.vsix`, minus their tests, and the extension can find them
from its own installation rather than from a workspace.

**Nothing composes from them yet.** That is story 3. What closes this one is that the files are in
the package, at paths the extension can compute, and that the packaging assertion written in story
1 was satisfied deliberately rather than loosened.

## Problem

FR-81 has the extension carrying `core/` and `stacks/` in its own bundle. Story 1 put them in the
repository and **excluded them from the package on purpose**, because until something reads them
they are 132 KB of weight. Story 3 is what reads them. This story is the step between: they ship,
and they are findable.

The order matters in one direction only — composing from files that are not in the package fails at
runtime in an installed editor, which is the worst place for this to be discovered.

## Measured before this was written

| | |
|---|---|
| what would ship | **57 files, 132 KB** — `core/` 22 and `stacks/` 35, excluding 16 `*.test.sh` |
| the package today | **6 files** |
| executable files that are not tests | 8 — four `cont-init` hooks, a service `run`, and three scripts |

**A `.vsix` preserves the executable bit.** Probed rather than assumed: packaged with
`core/cont-init/` un-ignored, the zip's mode bits came back `755` for what is `755` in the
repository and `644` for what is `644`. So the scenario about it is an assertion that this keeps
being true, not a repair.

**And the image's build does not depend on that anyway.** `core/Dockerfile.frag` runs `chmod +x`
after every `COPY` of a hook or a service. Where the bit does matter is anything the **host** runs
straight out of the package — `core/compose-dockerfile.sh` in story 3 — and invoking it through
`bash` rather than directly is the cheaper guarantee.

## A trap the probe walked into

Un-ignoring with a negation brought the tests back with it:

```
.vscodeignore:  core/**
                !core/cont-init/**     ← and 40-ai-memory.test.sh shipped
```

Later patterns win, so a negation re-admits everything under its path including what an earlier
line excluded. **The answer is to stop excluding the directories and exclude only the tests**:

```
core/**/*.test.sh
stacks/**/*.test.sh
scripts/**
```

No negation, nothing to order wrongly, and a new stack travels without anybody editing a list —
which is the third scenario, and the same property `discover-stacks` gives the other side.

## Acceptance criteria

Six scenarios in
[`the-bundle-carries-the-images-content.feature`](the-bundle-carries-the-images-content.feature).

**One is `@manual`, and it is the boundary this story cannot see across.** Everything else reads
the package, which is a zip whose paths are prefixed `extension/`; what an *installed* extension has
on disk is not readable from here. The editor strips that prefix, and nothing in this story would
notice if that assumption were wrong — story 3 would, at runtime, in somebody's editor.

## Out of scope

- **Composing or building from the bundled files** — story 3.
- **Deleting `setup` and the submodule** — the submodule supplies `MODES.md` until story 5 brings
  `docs/agent/` here, and `setup` is still what the build command invokes.
- **Shrinking what ships.** 132 KB is the content, and trimming it to fit a number nobody set is
  how a stack loses a file.

## Tasks

Written after this gate, not before.

| Order | Task | Status |
|---|---|---|
| 1 | [`tasks/the-package-carries-them-and-says-so.md`](tasks/the-package-carries-them-and-says-so.md) | Draft |

## Outcome

Filled in when the status leaves `Draft`.
