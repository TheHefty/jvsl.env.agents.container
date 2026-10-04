---
status: Draft
story: the-extension-carries-the-image/opening-a-project-the-extension-chose
epic: the-extension-carries-the-image
pr:
---

# Task: a-command-picks-a-folder-and-opens-it

## Summary

A command shows a folder picker and opens what it chose. FR-88, minus the half that turns out to
belong to story 8.

## The story's first task was about activation, and the measurement moves it

The sketch had task 1 as *"the extension activates without a folder"*, and the SRS accepted
`onStartupFinished` with its cost named: the extension loads in **every window on that host**,
including ones with nothing to do with any of this.

**None of that is needed here.** Measured:

| | |
|---|---|
| `contributes.menus` | gates only the view-title items; the three commands are in the palette unconditionally |
| implicit activation | since VS Code 1.74 a contributed command activates the extension with no `onCommand` event — which story 4 made a manifest rule with a negative fixture |

So a command is reachable from the palette **with no folder open**, and invoking it activates the
extension. `onStartupFinished` buys nothing until something has to exist *before* anybody asks for
it — which is the panel, story 8. **The cost the SRS accepted is deferred to the story that actually
needs it**, where it can be weighed against something it buys.

## Proposal

`Dev Container: Open a Project…` — `showOpenDialog` for a directory, then `vscode.openFolder`.

**What happens after that is not this task's**, and saying so is the point. `openFolder` restarts the
extension host; the new window activates on its own and `prepare` runs there as it already does.
The reattach is the story's `@manual` scenario, and persisting anything across the reload is story
7's, because only creating a project needs the extension to remember why it opened the folder.

## Three worst failure scenarios

**1. It opens a folder that is not a project and says nothing.** `prepare` returns silently when
there is no folder; with a folder that has no manifest it will produce a decision, and the third
scenario of this story says that case asks the questions. **Until that task lands, choosing a folder
with no manifest must say what it found rather than appearing to work** — a picker that accepts
anything and then does nothing is worse than one that refuses, because the person believes it
started.

**2. The picker replaces the window somebody was using.** `vscode.openFolder` defaults to the
current window, so an unsaved editor in an unrelated project is somebody's work being closed. The
decision is `forceNewWindow` and it is not obvious: a new window for every open accumulates windows,
and reusing one loses state. **A folder already open in a window must not open a second one**, which
is the case most likely to be got wrong.

**3. The command appears for a project this extension cannot help with.** It is in the palette
unconditionally, which is what makes it reachable with no folder open — and also means it shows in
every window, including a Python project nobody wants a dev container for. Choosing a folder with
no manifest and no `core/` to build from has to end in a sentence, not a build.

## Verification

| Test | Asserts |
|---|---|
| a new unit test | the decision to open is a function over what the picker returned: nothing chosen is not an error, a chosen folder names what will happen next |
| the same | a folder already open in a window is not opened again |
| `manifest.test.ts` | the command is contributed, and no `onCommand` event is declared for it — the implicit activation story 4 asserted is what makes it reachable |

**`showOpenDialog` and `openFolder` are not testable without an editor**, so the task's shape is a
pure function over *the folder that came back* plus a thin caller — the same split `decideOpen` already
uses, and the reason this repository can test anything about opening at all.

## Out of scope

- **`onStartupFinished` and the panel** — story 8, which is what needs activation before anybody asks.
- **Building a missing image** — FR-89, the next task.
- **Asking the questions when there is no manifest** — the task after that.
- **Surviving the reload** — story 7, where creating a project needs the extension to remember why.

## Outcome

Filled in when the status leaves `Draft`.
