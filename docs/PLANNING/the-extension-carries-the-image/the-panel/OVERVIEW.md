# Story: The panel

| | |
|---|---|
| **Status** | Draft |
| **Epic** | `the-extension-carries-the-image` |
| **Date** | 2026-10-02 |

## Summary

One place to start, present with no folder open, offering creating a project and opening one.
FR-92.

## Why it is last

**An entry for a capability that does not exist yet is a worse state than no entry.** It reports a
defect where there is only an absence, and whoever clicks it learns that this extension's buttons
cannot be trusted — which is expensive to undo. Everything the panel offers is built by stories 3
through 7; the panel is the door, and a door is fitted after the room.

## The cost it makes visible

`onStartupFinished` is the price of existing with no folder open: the extension loads in **every
window on that host**, including ones that have nothing to do with any of this. Accepted in the
SRS with activation doing the least it can. This story is where that becomes observable, and the
second `@manual` scenario is the only way to answer whether the price is actually paid.

## Where host problems belong

The panel is the first thing anybody sees, which makes it the right place for *no usable container
runtime* to surface — rather than three clicks later, inside a build, as a message about something
else. `host.ts` already makes that check and names the package per package manager; this story
moves where its answer is shown.

## Acceptance criteria

Five scenarios in [`the-panel.feature`](the-panel.feature). **Two are `@manual`**, and both are of
a kind nothing automates: whether a person who has not seen it can tell the entries apart, and
whether loading in every window costs anything they notice.

## Out of scope

- **A view of the project's state.** `jvsl.devContainer.showDetected` already exists for that and
  belongs to a project that is open.
- **The agents screen** — a separate epic.

## Tasks

Written after this gate, not before.

| Order | Task | Status |
|---|---|---|
| — | — | — |

**Deliberately empty.** Writing tasks for the panel now would be inventing failure scenarios for
code whose shape is decided by stories 3 through 7 — what the entries call, what they can report,
and what state exists when no folder is open. The story is written so the shape of the door is
agreed; the carpentry is specified when the room is built.

## Outcome

Filled in when the status leaves `Draft`.
