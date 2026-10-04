# Story: Opening a project the extension chose

| | |
|---|---|
| **Status** | **Done** — one `@manual` pass owed |
| **Epic** | `the-extension-carries-the-image` |
| **Date** | 2026-10-02 |

## Summary

The extension chooses the folder, builds the image if it is missing, and asks the stack questions
when there is no manifest. FR-88 and FR-89.

## Problem

Today a project is opened by opening its folder, and the extension wakes up inside it. The flow
inverts that: the extension is the entry point.

## Two costs this story pays, both named in the SRS

**The extension stops being scoped to a project.** A panel that offers to open a folder has to
exist with **no folder open**, which means `onStartupFinished` and loading in every window on that
host. Accepted with activation doing the least it can — register the entry and nothing else. The
cost is startup weight in unrelated windows, not wrong behaviour.

**FR-23 is reversed.** It refuses a project whose image does not exist, naming the command that
builds it. That was right while building was another repository's job and is not once the
extension builds.

## The cheap half of adoption

The epic this absorbed specified *"stack detection by heuristic on the host, confirmed by the
user"*. The flow asks instead: no manifest means the same panel a new project sees. **There is no
heuristic to be wrong and nothing to confirm**, and the hardest part of that epic is deleted rather
than built.

## Acceptance criteria

Five scenarios in
[`opening-a-project-the-extension-chose.feature`](opening-a-project-the-extension-chose.feature).
One is `@manual`: a window reloading and reattaching is what no fixture watches.

## Out of scope

- **Scaffolding a new project** — story 7, which is this flow with a prefix.
- **The panel itself** — story 8. This story's entry can be a command.

## Tasks

Written after this gate, not before.

| Order | Task | Status |
|---|---|---|
| 1 | [`tasks/a-command-picks-a-folder-and-opens-it.md`](tasks/a-command-picks-a-folder-and-opens-it.md) | Done — #66 |
| 2 | [`tasks/a-missing-image-is-built-rather-than-refused.md`](tasks/a-missing-image-is-built-rather-than-refused.md) | Draft |
| 3 | [`tasks/no-manifest-means-the-questions.md`](tasks/no-manifest-means-the-questions.md) | Done — #71 |

**Task 1 was "the extension activates without a folder" and the measurement moved it.** A
contributed command is in the palette with no folder open, and invoking it activates the extension
implicitly — which story 4 turned into a manifest rule with a negative fixture on the `engines`
floor. So `onStartupFinished`, and the cost the SRS accepted with it, belongs to **story 8**: it buys
nothing until something must exist before anybody asks for it, which is the panel.

## Outcome

Filled in when the status leaves `Draft`.
