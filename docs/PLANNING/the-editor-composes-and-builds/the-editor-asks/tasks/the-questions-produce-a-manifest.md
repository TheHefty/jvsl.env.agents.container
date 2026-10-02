---
status: Done
story: the-editor-composes-and-builds/the-editor-asks
epic: the-editor-composes-and-builds
pr: 25
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

Implemented in #25. `src/questions.ts` with nine tests, a `Dev Container: Configure Stacks and Limits`
command, and the activation event the story called for. 79 tests in all, up from 69.

**The activation change was refused by this repository's own manifest guard, and the guard was half
right.** Its rule was categorical — *no activation event names a path inside the submodule* — with a
reason that is still true: `.code-server/` exists and is empty after a clone without `--recursive`, so
an event naming anything inside it never fires, in exactly the case a project most needs to be told
something.

But the invariant that carries that reason is narrower: **at least one event has to fire without the
submodule**, not *none may name it*. The manifest at the root covers a project that has run `setup`;
`.code-server/setup` covers one that has not; neither alone covers both. The rule is now "not only
submodule paths", the negative fixture that had only a submodule path still fails it, and a new fixture
asserts the pair this repository actually ships.

That was worth more than the three lines it cost. A guard stated more broadly than its reason refuses a
correct change, and the temptation then is to weaken it to whatever lets the change through — which is
how the reason gets lost. The reason is in the test, in full, next to the narrower rule.

**Two tests were watched failing against deliberately wrong implementations:** `nextManifest` rebuilt
from the answers alone drops a project's own keys, and `stacksAvailable` reading a hardcoded list makes
a stack added to the template invisible. Those are failure scenarios 1 and 2; the third — a cancelled
run writing what was answered so far — is prevented by structure rather than asserted, because every
`undefined` from a picker returns before anything is written.

**A process slip worth recording:** the branch for this was cut from `master` before the design merged,
so the first attempt at writing this section failed on a file that did not exist on it — and the commit
and push went ahead anyway, because they were separate commands rather than chained to it. Rebased, and
the Outcome is here. It is the second time today that acting on what I remembered about a branch rather
than checking cost a correction.

**One scenario was not satisfied when this shipped, and the gap was found by reading the story's own
criteria back.** *"Confirming with nothing changed still builds"* was in the feature file from the
start, and this command wrote the manifest and told the reader to run `setup` by hand. The reason was
ordering rather than oversight — the build did not exist yet, it is story 3's — but the command was
merged describing itself as complete. Fixed in #28, once there was something to call.

**What is not covered, and is the story's `@manual`:** which picker appears in which order, and whether
the prompts read clearly. A mock of `showQuickPick` would assert that a pure function was called with
what it returned.
