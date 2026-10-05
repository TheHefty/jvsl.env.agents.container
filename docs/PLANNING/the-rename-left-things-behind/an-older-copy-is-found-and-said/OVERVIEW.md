# Story: An older copy of this extension is found and said

| | |
|---|---|
| **Epic** | `the-rename-left-things-behind` |
| **Date** | 2026-10-05 |

## Summary

When the extension published as `thehefty.jvsl-env-agents-vscode` is still installed, say so once and
name what to remove. FR-114, FR-115.

## What this is about, and it is not tidiness

**A rename changes an extension's identity, and the editor has no notion that one supersedes
another.** Installing `thehefty.jvsl-env-agents-container` leaves the older one installed beside it.
Both contribute to the command palette, and the older one's entries still read correctly — *Dev
Container: Build the Image* is a plausible thing to click.

What happens then is this epic's whole subject:

```
Command 'Dev Container: Build the Image' resulted in an error
command 'jvsl.devContainer.build' not found
```

**That is not an error anybody can act on.** It names an id nobody recognises, says nothing about
which extension owns it, and offers nothing to do. It cost an afternoon on 2026-10-05, and the three
dead strings inside *this* extension were found while looking for its cause rather than the other way
round.

## Why it is second, and small

Nothing depends on it. The whole deliverable is a sentence, shown once, blocking nothing — and that
proportion is the point: an older copy costs a person time and a wrong belief, which a sentence
fixes. A modal on every window would cost more than the defect does.

## Acceptance criteria

Six scenarios in
[`an-older-copy-is-found-and-said.feature`](an-older-copy-is-found-and-said.feature). **Two are
`@manual`**, and both are about a person rather than a program.

The second of those exists because of something that changed recently: **this extension now activates
in every window on the host**, since the panel has to be there before anybody asks for it. Whether
"once" was chosen correctly is therefore not an assertion — it is whether somebody opening five
windows in a day feels informed or nagged.

## How often "once" is: once per window

**Decided by the operator on 2026-10-05**, from the three readings below. No stored state at all —
the extension looks for the older copy when it starts, says so if it is there, and forgets.

**The cost is named rather than discovered later.** This extension activates in every window on the
host, so "once per window" is once per window *opened*, not once per day. Somebody with the older
copy installed and five windows open has been told five times. That is accepted here, and the second
`@manual` scenario is what checks whether it was the right call — the thing it buys is that there is
no state to go stale, no `globalState` key to migrate, and nothing that can silently stop telling
somebody about a problem they still have.

The three readings, kept because the choice is only legible beside what it was chosen over:

| | |
|---|---|
| **once per window** | no stored state at all, and the simplest thing that can work. With activation in every window, it is also the one that can become a nuisance |
| **once per machine** | needs `globalState`, and says it exactly once ever — including to somebody who dismissed it, forgot, and still has the older copy a month later |
| **once until it is gone** | says it each time the older copy is still there, at some interval. Most correct, most moving parts |

## One thing the task has to check rather than assume

**The identity is inferred.** `thehefty.jvsl-env-agents-vscode` comes from the release-please
component name plus the publisher, not from anything that was read off an installed extension. A
notice telling somebody to remove an extension that is not what they have is worse than no notice —
which is why the fourth scenario compares the name against what the editor reports.

## Out of scope

- **Removing it.** Uninstalling somebody's extension is not this extension's to do, by the same rule
  that governs every other file and setting it will not touch.
- **Any other stale identity.** The manifest was story 1; the command names and `HOME` were fixed
  before this epic was written.

## Tasks

| Order | Task | Status |
|---|---|---|
| 1 | [`tasks/the-older-copy-is-looked-for.md`](tasks/the-older-copy-is-looked-for.md) | Done |

## Outcome

Filled in when the story closes.
