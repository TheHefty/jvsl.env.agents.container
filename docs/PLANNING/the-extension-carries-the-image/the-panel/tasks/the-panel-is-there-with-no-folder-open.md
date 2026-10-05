---
status: Done
story: the-extension-carries-the-image/the-panel
epic: the-extension-carries-the-image
pr: 83
---

# Task: the-panel-is-there-with-no-folder-open

# Summary

The view offers creating and opening when there is no folder, says so when the host cannot build,
and the extension activates to show it. FR-92, and the last task of the epic.

## What already exists, and what it does with no folder

| | |
|---|---|
| the view | contributed to the Explorer as `jvsl.agentContainer.view` |
| `getChildren` with no folder | `return []` — so the view is **invisible** exactly when the panel is wanted |
| `hostProblems(checks)` | already produces the sentences the third scenario needs, each naming the package for this distribution's manager |
| the two entries' work | both commands exist — `create` and `open` |

So the task is three small things, and **the cost the earlier stories deferred to here.**

## The cost, now due

`onStartupFinished`. The SRS accepted it with the price named: the extension loads in **every window
on that host**, including ones with nothing to do with any of this. Stories 6 and 7 did not need it,
because a contributed command activates the extension on its own — so it was deferred to the story
that buys something with it. This is that story.

Activation does the least it can: register the view and nothing else. **`prepare` must not run in a
window with no folder**, and today it returns early when there is none — which is the behaviour that
makes `onStartupFinished` affordable rather than a change of what activation does.

## Two places describe one condition and disagree

Found while measuring. The condition is "no stacks are available", which now means a broken
installation:

| | |
|---|---|
| `extension.ts` | *"the extension carries them, so an empty list means this installation is incomplete rather than this project being unconfigured — reinstall it"* |
| `view.ts` | *"Template not checked out — run: `git submodule update --init`"* |

**The second is an instruction that cannot work**, for a submodule this repository removed. It
survived the submodule's removal because `nothing-reads-the-submodule.test.sh` checks for `.code-server/`
*paths* and this is prose — the guard is right about its subject and this was never its subject.

Fixing it is in scope here because the panel is where somebody meets that row: a view that is now
visible with no folder open is a view whose every message has an audience it did not have before.

## Three worst failure scenarios

**1. The panel offers what it cannot do.** The story is explicit that an entry for an absent
capability is worse than no entry, because it reports a defect where there is only an absence. Both
entries' commands exist, so the risk is not today's — it is that the rows are written as literals
beside the commands rather than derived from them, and the next command removed leaves a row behind.

**2. The host problem is shown after the offer rather than before it.** `hostProblems` is already
computed by the build and the open; the panel is the **first** thing anybody sees, so a host with no
usable docker has to say so there rather than three clicks later, inside a build, as a message about
something else.

**3. `onStartupFinished` does more than register.** Anything expensive at activation is paid in every
window on the machine. `prepare` returning early with no folder is what keeps this cheap, and a test
has to hold that activation in a folderless window reaches nothing else — otherwise the cost the SRS
accepted quietly becomes a different cost.

## Verification

| Test | Asserts |
|---|---|
| `view.test.ts` | with no folder and no manifest, the rows are the two entries, and each names a command that `package.json` contributes |
| the same | a host problem is the **first** row, before either entry |
| the same | the no-stacks row names a reinstall rather than a submodule, and agrees with what the command says about the same condition |
| `manifest.test.ts` | `onStartupFinished` is declared, and the manifest event still is too — see below |

**The manifest event stays, and the story's third failure scenario is why.** `onStartupFinished`
fires when the editor has settled; a project opened directly wants the extension awake without
waiting for that. They are not redundant, and the comment says so, because the next person to read
them will think they are.

## Outcome

Implemented in #83. 166 unit tests, typecheck clean. **The last task of the epic.**

**The entries carry their command rather than naming it beside the row.** The design's first failure
scenario said the risk was rows written as literals, and carrying the command is what makes the row
and the capability one thing rather than two that can drift.

**A probe proved the ordering assertion holds.** Moving the host problem after the entries turned it
red; it was put back.

**The cost the SRS accepted is paid, and what pays for it is `prepare` returning early.** A window
onto an unrelated project does a registration, one host check, and stops. The host check is the one
thing worth paying for without a folder, because the panel is the first thing anybody sees.

**One test reversed rather than being deleted**, and that is the second time in this epic. *"An
uninitialised submodule is its own row"* asserted the detail named `submodule update --init` — right
while the stacks came from a submodule. It now asserts a reinstall, and says in its own body that it
reversed and why. **The structural claim survived the message:** an empty list and "there is nothing
to list" send somebody to different places, which was always the point of that test.

**And the guard that should have caught the stale message could not.**
`nothing-reads-the-submodule.test.sh` looks for `.code-server/` *paths*; this was prose telling
somebody to run a command for a submodule that no longer exists. The guard was right about its
subject — this was never its subject — and what found it was reading `view.ts` while measuring for
this task, not a check.
