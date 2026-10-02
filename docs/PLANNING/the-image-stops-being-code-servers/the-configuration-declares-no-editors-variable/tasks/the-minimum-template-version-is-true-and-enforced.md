---
status: Done
story: the-image-stops-being-code-servers/the-configuration-declares-no-editors-variable
epic: the-image-stops-being-code-servers
pr: 33
depends-on: []
---

# Task: the-minimum-template-version-is-true-and-enforced

## Summary

`PASSWORD` leaves `containerEnv`, `templateMinVersion` becomes `5.0.0`, and `decideOpen` refuses a
template below it — with the three cases the version can be in kept apart, because they have three
different fixes.

## Problem

Three statements about which template this extension works against, and two of them are false.

**`PASSWORD: ''` is in every generated configuration.** It existed so code-server would not demand a
password. There is no code-server as of template `5.0.0`. FR-74.

**`templateMinVersion` says `2.2.0` and has been wrong since `2.3.0`**, which is when the
`devcontainer.metadata` label gained extensions and `.vscode`/`.devcontainer` became read-only to the
agent — both of which this extension depends on. Nothing noticed because nothing reads the number:
it is printed by `formatDetected` and consulted by no decision.

**So a project on an older template opens and succeeds**, and delivers an editor with no extensions
at all. Nothing anywhere says why.

## Proposal

**`PASSWORD` is deleted** from `buildConfiguration`'s `containerEnv`. `PUID` and `PGID` stay: those
are the base image's `init-adduser`, not the editor's, and the whole ownership arrangement rests on
them.

**`templateMinVersion` becomes `5.0.0`** — the release that removes the editor. That number is
release-please's, computed from the commits, and the tag lands when the template's release PR merges.
Nothing here guesses it.

**`decideOpen` gains a refusal, and the version's three states stay three.** `diagnostics.ts` already
carries the half of this that was written down:

> **An unreadable template version is not an old one.** Saying "too old" for a file that could not be
> read sends the reader to bump a submodule that is missing entirely.

Reading the existing helpers shows there are **three** states rather than two, because
`readTemplateVersion` returns the file's contents and `parseVersion` is what rejects nonsense:

| state | what happened | what the reader has to do |
|---|---|---|
| `readTemplateVersion` → `null` | `.code-server/version.txt` is absent or empty | `git submodule update --init` — the submodule was never initialised |
| it returns a string, `parseVersion` → `null` | the file is there and is not a version | look at the file; something wrote something else into it |
| parsed, and below the minimum | the template is old | bump the submodule to at least `5.0.0` |

Three refusals with three causes. Collapsing the first two into "unreadable" would be closer than
collapsing all three, and still sends somebody to the wrong file.

**`template.ts` gains the comparison it does not have.** It offers `parseVersion` and
`readTemplateVersion` and nothing that orders two versions. `isAtLeast(found, minimum)` goes beside
them, with its own tests, because the ordering is where an off-by-one is invisible: `4.9.0` against
`5.0.0` is the case a naive string compare gets wrong, and `10.0.0` against `9.0.0` is the one a
naive numeric-prefix compare gets wrong.

**Where the refusal goes.** After the check that the Dev Containers command exists — without that
nothing works at all and the version is beside the point — and before the running-launcher check. A
too-old template is the wrong arrangement rather than a transient condition.

**`OpenContext` gains the version**, as a string or `null`, read by the caller. `decideOpen` stays
pure: it is handed what the host looks like and returns a decision, which is why every scenario in
this story is testable without an editor.

### Tests

| Test | Where | Asserts |
|---|---|---|
| no password in the generated configuration | `devcontainer.test.ts` | FR-74 |
| `PUID`/`PGID` still declared | same | the base's, not the editor's — and the assertion that stops the next cleanup taking them |
| a version below the minimum is refused, naming both numbers | `open.test.ts` | the story's scenario |
| an absent version refuses by naming the submodule | same | the first of the three states |
| an unparseable version refuses without saying "out of date" | same | the second, and the one the existing comment did not foresee |
| exactly the minimum is not refused | same | the off-by-one, in the direction that locks people out |
| `isAtLeast` orders `4.9.0`, `5.0.0`, `5.0.1`, `10.0.0` | `template.test.ts` | both naive comparisons, by name |

**`manifest.test.ts` already asserts `templateMinVersion` is present and parseable** and keeps doing
so. It cannot assert the number is *high enough*: that would mean knowing which template features
this extension uses, which is a person reading two repositories. See the debt below.

## Three worst failure scenarios

| # | Scenario | How it manifests | Test that catches it |
|---|---|---|---|
| 1 | The comparison is wrong at the boundary and refuses a template that is fine | **Nobody can open anything**, and the message says to bump a submodule that is already current. Worse than the bug being fixed, because the old behaviour at least opened | The "exactly the minimum" assertion, plus `isAtLeast` over the four versions that break the two naive implementations |
| 2 | The three states collapse into one message | Somebody with an uninitialised submodule is told to bump it, and bumping does nothing because there is nothing there. This is the failure `diagnostics.ts` already warned about in writing, which is why it would be embarrassing rather than surprising | One assertion per state, each checking the message names the right fix |
| 3 | `PUID`/`PGID` go with `PASSWORD` | They look like the same kind of thing — three environment variables in one object, two of them obscure. Without them `init-adduser` applies nothing and the first bind-mounted write lands as uid 911, read as a host permissions problem | The assertion that both are still declared. It exists for that reason and not for coverage |

## Blast radius

- [x] **The generated configuration** — one variable fewer, in every project, on the next open.
- [x] **Opening a project at all** — this adds a refusal, which is the first time a template version
  can stop an open. Failure scenario 1 is that going wrong.
- [x] **Consumers on an older template** — deliberately. They are told to bump rather than handed a
  bare editor.
- [ ] The image
- [ ] The agent's sandbox map

## Alternatives considered

- **Leaving the number and only deleting `PASSWORD`.** Rejected at the story's gate: the stale number
  is the larger defect of the two.
- **Reporting instead of refusing.** Today's behaviour. Rejected because the diagnostics output is
  read by somebody who already suspects something, and the failure it would explain is an editor
  that silently has no extensions.
- **Comparing versions with a string compare.** `4.9.0 < 5.0.0` is true lexically and `10.0.0 <
  9.0.0` is also true, which is the bug failure scenario 1 is about.
- **Refusing on an unreadable version by treating it as `0.0.0`.** Rejected: that is exactly the
  collapse `diagnostics.ts` warns against, and `parseVersion` already returns `null` rather than a
  zeroed version *for this reason*, which its own comment says.

## Verification

- `npm test` — every assertion above is a pure function over a context.
- **Nothing verifies that `5.0.0` is the right minimum.** It is right because the editor's removal is
  what this extension now needs, which is a claim about two repositories that no test spans.

Nothing is implemented yet; this is the design.

## Open questions

None. The one the story left — what number to use — was answered by the template's release.

## The debt this leaves

**Nothing can check that `templateMinVersion` matches what the extension actually uses.** The number
was wrong for three releases and was found by a person reading both repositories while writing a
story about something else.

A test would have to know which template features the code depends on, and that knowledge exists
only in prose. What is possible, and is not this task, is narrower: a check that the number is not
*below* the template version the extension's own tests build against, if those ever pin one. Recorded
here rather than invented, because a guard that cannot see the thing it guards is worse than the
absence of one — which is the lesson two guards in the template already carry.

## Outcome

Implemented in #33. 119 unit tests and 5 bundle tests, typecheck clean. Red first: six failures
across three files before any implementation.

**This design shipped without an `## Outcome` section**, which every other task document has, and
the script that went to fill it failed its own assertion rather than appending to the wrong place.
Noted because the assertion is the only reason it was caught — the alternative was a commit message
describing a document update that had not happened.

**The minimum is passed in rather than declared in `open.ts`.** The design said `OpenContext` gains
the *version*; writing it showed the *minimum* has to come the same way. A constant in `open.ts`
would have been a second place to keep in step with `package.json` — which is the exact defect this
task exists for. `extension.ts` already read it for the diagnostics, so it is the only reader and
`decideOpen` stays pure.

**One of my own messages failed one of my own assertions, and the assertion was right.** The refusal
for an absent `version.txt` read "…the submodule was never initialised rather than that the template
is out of date", and the test forbids `/out of date|too old/i` there. Naming the words in order to
deny them still puts them in front of somebody skimming. It now says what bumping would accomplish
instead: "without the submodule there is no template at all, so bumping a pointer would move
nothing."

**Two tests outside this task changed.** `devcontainer.test.ts`'s "what the specification expresses
natively is not hidden in runArgs" asserted the whole `containerEnv` object by value, so removing
`PASSWORD` broke it — the assertion working. And `tools/devcontainer-up.test.ts` needed both new
fields, supplied rather than read because its fixture is not a project with a submodule.

**The three messages were read as a person receives them**, not only matched by regex. The
below-minimum one names what is lost — "the image declares no extensions for the editor to install
and the agent's sandbox does not hold `.vscode` read-only, so opening would succeed and deliver less
than it looks like" — because "too old" tells somebody nothing about what ignoring it costs.

**The debt stands exactly as written.** Nothing checks that `5.0.0` is the right minimum, and
nothing can without spanning two repositories.

**And it is already superseded.** The SRS's seventh amendment, the same day, strikes **FR-22** — the
minimum-template-version requirement this task delivers — because the extension stops consuming a
template and there is no second version left to disagree with. What this task built is therefore
scheduled for deletion: `isAtLeast`, `readTemplateVersion`, the two `OpenContext` fields, the three
refusals and their tests. The task's other half, FR-74 and the `PASSWORD` removal, stands. Recorded
here rather than only in the amendment so that whoever deletes the code finds the reason beside the
code's own justification, and does not have to reconstruct why something tested this carefully is
being thrown away.
