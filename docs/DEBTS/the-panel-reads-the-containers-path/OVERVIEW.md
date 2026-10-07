# Debt: the panel reads the container's path on the host

| | |
|---|---|
| **Status** | Open |
| **Date** | 2026-10-07 |
| **Kind** | defect: a problem found during other work and not yet fixed |
| **Found by** | the operator's screenshot of the board, in a window connected to this repository's container |

## Problem

In a window connected to a project's container, the Agent Container panel says **"Not configured
yet"** for a project that has a manifest. Seen on this repository on 2026-10-07: its
`.agent-container.stack.json` selects Node 22, and the panel showed nothing selected.

## Root cause

**Observed:** the panel reads its state from `folder.uri.fsPath` (`src/extension.ts:310`, through
`readViewState`). The extension runs on the host (`extensionKind: ["ui"]`, measured on 2026-10-06).
In a connected window the folder's path is the container's own, `/config/workspace`. It names
nothing on the host, so the manifest reads as absent.

**Suspected, not verified:** four other places read host files through the same path:

| Where | What it reads |
|---|---|
| `src/extension.ts:199` | manifest adoption at startup |
| `src/extension.ts:583` | the open flow |
| `src/extension.ts:737` | Show What Was Detected |
| `src/extension.ts:412` | Configure Stacks and Limits, which also **writes** the manifest there |

Each would behave as if the project had no files whenever the window is connected. None of these
four has been observed failing. **Configure is the worst of them if it does**: it would start from an
empty selection and write to a path that is not the project's, reporting success while the project's
manifest stays unchanged. A manifest change seen on 2026-10-07 turned out to be the operator testing,
so it is not evidence either way.

## Fix

Not made. The board already resolves the host path in a connected window: `hostPathFromAuthority` in
`src/board-locate.ts` decodes it from the remote authority. That decoding was verified on the
operator's host on 2026-10-07, when the board reached "This project has no tracker", a state that
needs both the decoded host path and a read of the manifest there.

The likely fix is one function returning the project's host path for either kind of window, used by
the panel and by the four callers above. Each caller is a change in behaviour in connected windows,
so it is a task with its own failure scenarios, not a one-line patch.

## Regression scenario

In a window connected to a project's container, the panel shows the stacks and limits that the
project's manifest selects.

## Payback

When the operator agrees a task for it. The panel is wrong in every connected window, which is where
the operator works.

## Outcome

Open.
