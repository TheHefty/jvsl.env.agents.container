---
status: Draft
story: the-editor-composes-and-builds/the-editor-asks
epic: the-editor-composes-and-builds
pr:
depends-on: []
---

# Task: the-questions-produce-a-manifest

## Summary

The five questions, as a command, writing `.code-server.stack.json`. No view yet — that is the second
task, and this one is useful without it because a contributed command is reachable from the palette.

## Problem

`setup` can be answered from a manifest since template `4.0.0`. Nothing produces one except typing
JSON or running `setup` in a terminal, which is the thing this epic exists to replace.

## Proposal

**Everything that can be wrong is a pure function, and the editor's API is a thin shell over them.**
That is how the rest of this extension is tested without an editor, and here it is more than a habit:
the interesting failures are a dropped manifest key and a stale stack list, neither of which involves
a picker.

```ts
stacksAvailable(stacksDir): string[]           // directories, sorted
versionsOf(stacksDir, stack): string[]         // that stack's versions.json
requiresOf(stacksDir, stack): string[]         // optional requires.json
missingDependencies(selected, stacksDir): Array<{stack, needs}>
nextManifest(current, answers): object         // what gets written
```

**`nextManifest` mirrors `setup`'s `jq` pipeline rather than rebuilding the file.** It removes the keys
this project owns — every stack name the template has, plus `limits` — and adds back only what was
answered. Keeping only the selected keys would be the obvious implementation and is the one that ate a
project's own settings once: the manifest is the only per-project record of intent, and a feature was
blocked by exactly that. The template's comment on it is the specification this follows.

**A missing dependency refuses, naming both stacks.** `missingDependencies` is separate from the
pickers so the message can be asserted without one. The rule is the template's and the reason is
there: it fails loudly rather than changing a selection somebody made. The story's gate chose
pre-selection first and reversed it — one rule in two places beats two rules.

**Cancelling writes nothing.** Escape at any of the five steps abandons the whole thing. A
half-answered manifest is worse than no manifest: `setup` would read it and build something nobody
chose, and nothing would say that is what happened.

**An uninitialised submodule refuses before the first question.** `.code-server/` exists and is empty
until `git submodule update --init`, so `stacksAvailable` would return an empty list and the first
picker would offer nothing — a question with no answers, which reads as a broken extension rather than
a missing checkout. The refusal names the command to run.

### Tests

| Test | Asserts |
|---|---|
| the available stacks are the directories that exist | over a fixture tree, including one added after the fact |
| the versions offered are the stack's own | and in the file's order, so "lowest listed" means something |
| a stack the manifest does not mention defaults to the lowest | the same default `setup` uses |
| an unknown key survives `nextManifest` | the regression this repository has already had |
| a deselected stack is removed | the other half of that, which is why keys are stripped by name |
| `limits` is replaced rather than merged | `setup` writes it whole; two shapes of the same field is worse than either |
| a missing dependency is reported with both names | the refusal, without a picker |
| a satisfied dependency reports nothing | the negative case, so the check is not vacuously true |
| an empty stacks directory is distinguishable from no stacks selected | the refusal above, which is the case that reads as a bug |

Nine, none needing an editor. The command's wiring — which picker is shown in which order — is covered
by the story's `@manual` scenario and by story 3's work, not by a mock of the editor's API: a test
that asserts `showQuickPick` was called with a list is a test of the list, and the list is a pure
function already.

## Three worst failure scenarios

| # | Scenario | How it manifests | Test that catches it |
|---|---|---|---|
| 1 | The manifest is rebuilt from the answers and a project's own key disappears | Silent loss in the one file a project owns. It happened before, it blocked a feature, and the symptom is a setting that stops working with nothing in any diff — the file is rewritten wholesale either way | `nextManifest` over a manifest carrying keys nobody here writes |
| 2 | The stack list comes from anywhere but the directory | A stack added to the template is invisible here, and the only symptom is somebody not finding it. There is no error and the list looks complete | The fixture tree test, with a stack added after the fixture is built |
| 3 | A cancelled run writes what was answered so far | `setup` reads it and builds an image nobody chose. Worse than a crash: the build succeeds, and what it produces is wrong in a way the manifest now justifies | Cancellation at each of the five steps leaves the file byte-identical |

## Blast radius

- [x] **The stack manifest** — written by a second thing. Same format, same keys owned.
- [x] **Another story or task** — the view is the next task; story 3 builds from what this writes.
- [ ] The agent's sandbox map
- [ ] The template submodule
- [ ] A dependency fetched at build time

## Alternatives considered

- **Reading the stack list from a table in this repository.** Rejected: it is the drift the image's
  per-stack extension declarations were designed to avoid, in the opposite direction.
- **One multi-step QuickPick with its own state machine** instead of five calls. Rejected for now:
  nothing asked for back-navigation, and the state machine is where the bugs would be.
- **Writing the manifest as each answer is given**, so a cancel keeps progress. Rejected: that is
  failure scenario 3 as a feature.
- **Mocking the editor's API to test the wiring.** Rejected: it asserts that a function was called
  with what a pure function returned, which is a test of the mock.

## Verification

- `npm test`, which is where the nine tests run.
- The `@manual` pass belongs to the story and the view, not here.

Nothing is implemented yet; this is the design.

## Open questions

None.

## Outcome

Filled in when the status leaves `Draft`.
