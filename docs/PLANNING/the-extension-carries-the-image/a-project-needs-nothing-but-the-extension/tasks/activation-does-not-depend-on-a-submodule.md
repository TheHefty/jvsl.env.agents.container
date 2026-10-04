---
status: Draft
story: the-extension-carries-the-image/a-project-needs-nothing-but-the-extension
epic: the-extension-carries-the-image
pr:
---

# Task: activation-does-not-depend-on-a-submodule

## Summary

Nothing activates on a submodule, a project that still has one opens anyway, and the reasoning in
`manifest.test.ts` stops arguing for an event that no longer exists. FR-82.

## What is already done, and what that leaves

**The event is gone.** `workspaceContains:.code-server/setup` was removed with FR-22's machinery, so
`activationEvents` is one entry:

```json
["workspaceContains:.code-server.stack.json"]
```

So the story's third scenario is satisfied. What is left is smaller than the sketch assumed and
contains one thing the sketch would have got wrong.

## The removal looked like a cold-start regression and is not

`manifest.test.ts` carries this, in prose, as the reason that event existed:

> a project that has never run `setup` has no manifest, so the manifest event does not fire, and the
> thing whose purpose is to produce a manifest would never start.

Read as written, removing the event leaves a project with no manifest unable to be configured,
because the extension never wakes up to offer it. **Checked rather than reasoned about**, and the
documentation is explicit:

> Beginning with VS Code 1.74.0, commands contributed by your extension do not require a
> corresponding `onCommand` activation event declaration for your extension to be activated.

`engines.vscode` is `^1.90.0`, so all three contributed commands activate the extension implicitly.
A project with no manifest reaches `Dev Container: Configure Stacks and Limits` from the palette,
which activates and configures. **What changed is only that the extension no longer wakes up on its
own in such a project** — and there is nothing for it to do on its own until a manifest exists.

## The real deliverable is that the reasoning stops being wrong

`manifest.test.ts` now explains, at length, why an event was added that is not there, and asserts a
rule — *"not only submodule paths"* — whose subject has gone: there are no submodule paths left to be
"not only". A reader follows that comment looking for an event and finds nothing, which is the
dangling reference this project has already paid for twice today.

Its assertions have to say what is actually load-bearing now:

| | |
|---|---|
| the manifest event is present | still true, still the reason given: `.code-server/` exists and is empty after a clone without `--recursive`, so an event naming a path inside it never fires |
| **no** event names a path inside `.code-server/` | the rule inverts. It was "not only"; it is "none" |
| the commands are the path for a project with no manifest | asserted rather than assumed, because the implicit activation it relies on is a platform behaviour with a version floor |

## Three worst failure scenarios

**1. The `engines.vscode` floor drops below 1.74 and nothing notices.** Implicit command activation
is why a project with no manifest can be configured at all. A dependency bump that lowers the floor
would remove the only path, silently, and the symptom is "the command does nothing" — which reads as
a broken extension. The assertion is on the floor, not on the behaviour, because the behaviour cannot
be tested without an editor.

**2. A project that still carries `.code-server/` behaves differently.** Every project built on the
template has one. The code-level claim is already held by
`scripts/nothing-reads-the-submodule.test.sh`; what is missing is the open-level one: its **presence
changes nothing about the decision**. That is a test over `decideOpen`, which is a pure function, so
it costs one case.

**3. The manifest event is removed as "no longer needed" once the panel exists.** Story 6 adds
`onStartupFinished`, which activates everywhere — and it will look like it makes the manifest event
redundant. It does not: `onStartupFinished` is *when the editor has settled*, and a project opened
directly still wants the extension awake without waiting for that. The comment has to say so, or the
next person deletes it.

## Verification

| Test | Asserts |
|---|---|
| `manifest.test.ts` | no activation event names a path inside `.code-server/`; the manifest event is present; `engines.vscode` floor is at least 1.74 |
| `open.test.ts` | a project carrying `.code-server/` decides identically to one without it |

## Out of scope

- **`onStartupFinished`** — story 6, which is what needs activation with no folder open.
- **Removing the submodule from this repository** — story 5.

## Outcome

Filled in when the status leaves `Draft`.
