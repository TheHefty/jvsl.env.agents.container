# Story: The editor asks

| | |
|---|---|
| **Status** | Draft |
| **Epic** | `the-editor-composes-and-builds` |
| **Date** | 2026-10-02 |

## Summary

The five questions `whiptail` used to ask are asked by the editor, in its own pickers, and the
answers are written to `.code-server.stack.json`. A view in the sidebar shows what is selected.

## Why

It delivers **FR-61** and **FR-62**. Template `4.0.0` made `setup` answerable from a manifest; this
is the half that produces one without anybody typing JSON.

## What this story does

**Five steps, one per question `whiptail` asked**, using the editor's own pickers so there is no HTML,
no content security policy and no theme to match:

| step | picker | default |
|---|---|---|
| which stacks | multi-select of the directories under `.code-server/stacks/` | what the manifest already selects |
| version, per stack chosen | single-select of that stack's `versions.json` | the manifest's value, else the lowest listed |
| memory | input box | the manifest's, else `6g` |
| swap | input box, empty allowed | the manifest's |
| CPUs | input box, empty allowed | the manifest's |

**The lists come from the submodule on disk**, not from a table in this repository. A stack added to
the template appears here with no change on this side, which is the same property the image's
extension declarations have.

**A view in the sidebar shows what is selected** — the stacks with their versions, the limits — and is
what makes any of this discoverable. It is also what the gate chose over a status bar item and a
palette-only command: a command nobody knows about is not a button, and the state is worth seeing
without opening anything.

**Activation gains `workspaceContains:.code-server/setup`.** Today the extension activates on
`workspaceContains:.code-server.stack.json`, and **a project that has never run `setup` has no
manifest** — so it would not activate, and the view that exists to produce a manifest would never
appear. `.code-server/setup` is a path inside the submodule, which is empty until it is initialised;
that is a precondition of everything here anyway, and the existing event stays for the case where the
manifest exists.

**A missing stack dependency is refused, naming the pair.** `android` declares `java` in its
`requires.json`, and the picker refuses rather than adding `java` quietly — which is what `setup`
does, with the reason written there: it fails loudly instead of changing the selection somebody made.

## Decisions taken at this gate

**Pre-selecting the dependency was chosen first and then reversed, and the reversal is the point.**
Adding `java` automatically is less friction, and it would have left the extension and `setup`
disagreeing about the same `requires.json` — the same input producing different results depending on
which door it came through. One rule, and it is the one already written and tested in the template.

Worth recording because the original reason for that rule does **not** hold any more: it said the JDK
version is yours to pick, so `setup` would not add `java` behind your back. Both flows now ask the
version immediately after, so adding the stack picks no version. The rule survives on the narrower
reason — one rule beats two — rather than on the one it was written with.

**Confirming always builds**, even when nothing changed. `docker build` with an unchanged manifest is
a cache hit, and "I opened the screen and nothing happened" is worse than a few seconds. It is also
what `setup` does. The alternative — detect no change and stop — hides the case where somebody wants
a rebuild precisely because the manifest did not change, which is what a submodule bump looks like.

## Acceptance criteria

[`the-editor-asks.feature`](the-editor-asks.feature), beside this file. Agreed at the story gate,
before any task is written.

**One scenario is `@manual`** and it is the view: whether a tree reads clearly, and whether the
numbers on it are the ones a person expects to see, is not something a test over a data structure
answers. Everything else is a pure function over a manifest and a stacks directory.

## Tasks

Written after this gate, not before.

| Order | Task | Repo | Status |
|---|---|---|---|
| 1 | [`tasks/the-questions-produce-a-manifest.md`](tasks/the-questions-produce-a-manifest.md) | extension | Done — #25 |
| 2 | [`tasks/the-view-shows-what-is-selected.md`](tasks/the-view-shows-what-is-selected.md) | extension | Done — #26 |

Two slices. The first is useful without the second, because a contributed command is reachable from
the palette — and everything in it is a pure function, testable with no editor at all.

## Out of scope

- **Building.** Story 3, with the terminal and the host checks.
- **Detecting what a project needs.** The pickers ask; nothing here infers a stack from a project's
  files. That is the adoption epic.
- **Editing the manifest's other keys.** The extension writes the keys `setup` owns and leaves the
  rest exactly as `setup` does, for the same reason.
- **A webview.** Rejected at the SRS gate: HTML, a content security policy, message passing and a
  theme, for a checklist and three numbers.

## Outcome

Filled in when the status leaves `Draft`.
