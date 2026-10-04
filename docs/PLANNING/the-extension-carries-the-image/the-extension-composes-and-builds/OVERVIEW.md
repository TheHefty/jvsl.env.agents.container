# Story: The extension composes and builds

| | |
|---|---|
| **Status** | **Done** |
| **Epic** | `the-extension-carries-the-image` |
| **Date** | 2026-10-02 |

## Summary

The extension composes a project's Dockerfile from the `core/` and `stacks/` it carries, and builds
it. `setup` stops being what the build invokes, and a project stops needing anything on the host
but the extension.

## Problem

FR-81 is delivered in three steps and this is the third: story 1 put the content in the repository,
story 2 put it in the package, and nothing reads it yet. Today `build.ts` runs
`.code-server/setup` — a script in a submodule a project is not supposed to have.

## What makes this story the hinge

**Story 1's seventh scenario falls due here.** It said: *what CI builds is what will be shipped*,
and left a window open — CI composes with `core/compose-dockerfile.sh` while the extension invokes
`setup`, which calls the same script. The window closes when the extension composes directly, and
it closes **only if CI and the extension keep using one implementation**. If they diverge, CI is
verifying an image nobody runs, and nothing fails to say so.

The cheapest guarantee is that the extension shells out to `core/compose-dockerfile.sh` rather than
reimplementing composition in TypeScript. That is a decision this story takes and a task has to
justify against the alternative, which is a composition the extension can unit-test without a
shell.

## The risk this story carries

**A developer runs from a checkout; a user runs from an installed `.vsix`.** If the path to
`core/` is computed in a way that works in one and not the other, every test here passes and the
shipped extension fails at the first build — in somebody's editor, with a message about a missing
file. Story 2's `@manual` scenario exists for the same seam and does not close it: it checks the
files are installed, not that the code finds them.

## Acceptance criteria

Six scenarios in
[`the-extension-composes-and-builds.feature`](the-extension-composes-and-builds.feature). None is
`@manual` as written, and the third is the one most likely to need a pass against a real
installation rather than a fixture — a task may add the tag with its reason.

## Out of scope

- **Deleting `setup`** from what the repository carries. It is still the template's, and the
  template is archived rather than edited.
- **Removing the `.code-server/` submodule** — story 5, which is what replaces what it supplies.

## Tasks

Written after this gate, not before.

| Order | Task | Status |
|---|---|---|
| 1 | [`tasks/the-extension-composes-from-what-it-carries.md`](tasks/the-extension-composes-from-what-it-carries.md) | Done — #52 |
| 2 | [`tasks/opening-stops-requiring-a-submodule.md`](tasks/opening-stops-requiring-a-submodule.md) | Done — #54 |

**Task 1 was measured and the sketch was wrong about the hard part.** It assumed the work was
swapping one path for another. There is not one `extensionPath` or `extensionUri` anywhere in
`src/`: every path is workspace-relative, and the only access to extension-owned data is
`context.extension?.packageJSON`, which is metadata rather than a file. The task introduces the
concept, and that is most of it.

**And the risk this story named turned out to be closed already**, by a decision taken two stories
ago for another reason — see the task. Task 2 stays a sketch.

## Outcome

Filled in when the status leaves `Draft`.
