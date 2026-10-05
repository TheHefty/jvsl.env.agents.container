# Task: the older copy is looked for

| | |
|---|---|
| **Story** | `an-older-copy-is-found-and-said` |
| **Date** | 2026-10-05 |

## Summary

At activation, look for `thehefty.jvsl-env-agents-vscode` among the installed extensions. If it is
there, say so once and name what to remove. FR-114, FR-115.

## Problem

The rename changed this extension's identity, and the editor has no notion that one extension
supersedes another. Installing the current one leaves the older installed beside it, contributing
palette entries whose titles still read correctly and whose commands no longer exist.

**Nothing reports this.** `command 'jvsl.devContainer.build' not found` names an id, not an
extension; a person cannot get from it to "I have two of these installed".

## Proposal

**A pure function over the list of installed extension ids**, returning the sentence to show or
nothing, plus a two-line caller at activation.

```
olderCopyNotice(installed: readonly string[]): string | undefined
```

**The inference becomes a lookup key, which is the whole point.** `thehefty.jvsl-env-agents-vscode`
was derived from the release-please component plus the publisher and was never read off an installed
extension. As a *claim* that would be a notice telling somebody to remove something they may not
have; as a *key into what the editor reports*, being wrong costs nothing — the lookup simply misses
and nothing is said.

**Once per window, with no stored state.** Decided by the operator. The cost is accepted and named in
the story: with activation in every window, somebody with five windows has been told five times. What
it buys is that there is no state to go stale and nothing that can silently stop telling somebody
about a problem they still have.

## Three worst failure scenarios

**1. It names an extension the person does not have.** Worse than saying nothing: it sends somebody
to uninstall something unrelated, on the authority of a tool that sounded certain. This is the live
risk precisely because the id is inferred.

*Covered by:* the notice is produced only when the id is present in what the editor reports. The
inference is never asserted — it is looked up, and a wrong guess is silent.

**2. It tells the user to uninstall the extension that is showing the notice.** If the superseded id
ever equals the current one — a reverted rename, a copied constant, a typo that happens to match —
the notice becomes an instruction to remove the thing talking. It would read as authoritative and be
actively harmful.

*Covered by:* a test asserting the superseded id differs from `package.json`'s own
`publisher.name`, so the two can never converge without something failing.

**3. It blocks activation.** A modal, or an `await` on the notification, holds everything behind a
sentence that was explicitly not worth blocking for — and FR-115 says so. The failure would be
subtle: the extension appears slow or dead in windows where the older copy exists, which is exactly
the population already having a bad time.

*Covered by:* the notification is fired and not awaited, and the lookup is synchronous over an array
the editor already has in memory. Nothing in the path can wait.

## Blast radius

- **Every window on the host**, since activation is `onStartupFinished`. That is the cost the story
  accepted and the second `@manual` scenario checks.
- Nothing else reads or writes anything. No file, no state, no configuration.

## Alternatives considered

- **Offer to uninstall it.** Rejected: uninstalling somebody's extension is not this extension's to
  do, by the same rule that governs every file and setting it will not touch. The notice names the
  command; the person runs it.
- **Store that it was said.** Rejected by the operator — see the story for the three readings and
  what each costs.

## Verification

- **The function is pure** over a list of ids: present, absent, present-with-others, and a list that
  contains the current extension but not the older one.
- **The id cannot equal this extension's own**, asserted against `package.json`.
- **The two `@manual` passes** the story names: that somebody who has not seen it before can act on
  it, and that it is not a nuisance.

## Open questions

None. How often "once" is was settled by the operator on 2026-10-05: once per window, no stored
state.

## Outcome

Filled in when the task closes.
