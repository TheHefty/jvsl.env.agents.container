---
status: Draft
story: the-extension-carries-the-image/creating-a-project-from-nothing
epic: the-extension-carries-the-image
pr:
---

# Task: a-command-creates-a-project-and-opens-it

## Summary

`Agent Container: Create a Project…` — the questions, the plan applied, `git init` with one commit,
and then the folder opened. The story's fifth scenario, and what makes the `@manual` one possible.

## The story's sketch called this "the handoff across the reload", and the handoff needs nothing

The story's design said `vscode.openFolder` restarts the extension host and discards everything in
memory, so the handoff would need extension-scoped state keyed by path. **Measured, and it does
not.**

Activation calls `prepare(..., { handOver: false })` — but the task that built a missing image added
one clause:

```ts
if (options.handOver || decision.action === 'build') {
  await vscode.commands.executeCommand(REOPEN_COMMAND)
}
```

So after scaffolding, `openFolder` opens the new window, activation finds a manifest and no image,
**builds it and attaches.** Nothing has to remember why the folder was opened. A task written to the
sketch would have built `globalState` keyed by path for a handoff that happens anyway.

**What is actually unbuilt is the command.** `scaffoldPlan` has no caller, and the four contributed
commands are open, show, configure and build. So this task is the thing that ties the three
together, and the "handoff" is the fifth scenario falling out of it.

## Three worst failure scenarios

**1. The plan is applied and the commit is not, with nothing said.** Scaffolding reports `commit:
false` and a reason when git has no identity — if the caller drops that, somebody gets a project
whose files are there and whose history is empty, and finds out when they next run `git log`. The
note is shown, not only written to the channel.

**2. A write fails partway and the plan's shape is wasted.** `scaffoldPlan` returns a list precisely
so this is answerable: what landed is named and what did not is named, in one message. A loop that
throws on the third file and lets the exception out gives neither.

**3. `openFolder` is called when nothing was created.** A refused location, a cancelled question, a
failed write — each must stop before the folder is opened, because opening a directory that is not a
project lands somebody in a window where the extension then refuses, with the cause two steps
behind them.

## Verification

| Test | Asserts |
|---|---|
| a new unit test | the decision to open comes **after** the plan was applied, not from the same branch — a cancelled or refused run never reaches it |
| the same | a plan whose write fails reports what landed and what did not, and does not open |
| the same | `commit: false` is surfaced rather than swallowed |
| `manifest.test.ts` | the command is contributed, with the `Agent Container:` prefix and no `onCommand` event |

**`showOpenDialog`, `openFolder` and `git` are not exercisable here**, so the shape is the same split
the rest of this flow uses: a function over what came back, and a thin caller. The split is what
makes "does it open when nothing was written" a test rather than a manual check.

## Out of scope

- **The panel** — story 8. This is a command.
- **Anything about the created project's content** beyond what story 7's earlier tasks settled.

## Outcome

Filled in when the status leaves `Draft`.
