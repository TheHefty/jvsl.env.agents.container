---
status: Done
story: the-extension-carries-the-image/opening-a-project-the-extension-chose
epic: the-extension-carries-the-image
pr: 69
---

# Task: a-missing-image-is-built-rather-than-refused

## Summary

Opening a project whose image does not exist builds it, then hands over. FR-89.

## There is nothing to reverse, and the SRS says there is

FR-89 reads *"this reverses FR-23"*, and FR-23 says a project whose image does not exist is refused,
naming the image and the command that builds it.

**FR-23 was never implemented.** Measured: `decideOpen` has four refusals — the reopen command
missing, the launcher's container running, a hand-written configuration, and a `.gitignore` that
does not ignore the generated file. **None is about an image.** Nothing in `src/` inspects one;
there is no `docker image inspect`, no existence check, nothing.

So this task *adds* a behaviour rather than inverting one, and **the SRS has to stop saying
otherwise**: a reader told that FR-89 reverses FR-23 looks in a diff for a refusal being removed and
finds nothing, which is worse than being told the requirement was never built.

**What happens today is that the Dev Containers extension fails on its own.** Its message is about
a missing image rather than about what to do, which is the gap FR-23 was written for and never
closed. Stated as the expected behaviour rather than asserted — it is not reproducible from here.

## Proposal

`decideOpen` gains a `build` action for a project whose image is absent, and the caller chains the
build it already knows how to run into the handover it already does.

**The pieces exist.** `composeAndBuildCommand` composes and builds in a terminal;
`buildOutcome(code)` already distinguishes `ok`, `failed` and `cancelled` from a closed terminal's
exit code. What is new is the check, the action, and the chaining.

## Three worst failure scenarios

**1. The check reads something other than absence as absence, and builds every time.** A seven-minute
build on every open is worse than any error message. `docker image inspect` fails when the daemon
is unreachable as well as when the image is missing, and **FR-24 already refuses an unreachable
daemon** — confusing the two turns a host problem into a build nobody asked for, which then fails
for a third reason. The check has to distinguish *absent* from *cannot tell*, and `cannot tell` is
not a reason to build.

**2. The handover happens before the build finishes.** Then Dev Containers fails on a missing image
— exactly the status quo this task exists to replace, with a build running in a terminal beside it
making it look transient. The chain is on the terminal closing, which is what `buildOutcome` already
reads, and the handover must not be reachable on any other path.

**3. A cancelled build is read as a failure, or as a success.** `buildOutcome` returns `cancelled`
for a terminal closed with no exit code, and FR-66 requires that a cancelled build does not read as
a broken one. **Neither may it hand over**: somebody who stopped the build did not ask to open the
project, and attaching to a half-built image is the worst of the three outcomes.

## Verification

| Test | Asserts |
|---|---|
| `open.test.ts` | an absent image decides `build`, a present one decides `open`, and *cannot tell* decides neither — it refuses, naming the daemon |
| the same | the decision names the image it will build, so the terminal is not the only place that says what is happening |
| `build.test.ts` | the handover is reachable from `ok` and from nothing else — not from `failed`, not from `cancelled` |

**The third is the one that matters most and is cheapest to get wrong**, because the two bad
outcomes are opposite: refusing to hand over after a good build strands somebody, and handing over
after a cancelled one attaches them to nothing.

## Out of scope

- **Asking the questions when there is no manifest** — the next task. A project with no manifest
  has no stacks to compose, so this task's build is for a project that has one.
- **Showing build progress anywhere but the terminal** — FR-64 settled that, and a progress
  notification duplicating a terminal is two places to read one thing.

## Outcome

Implemented in #69. 136 unit tests, 11 bundle, typecheck clean.

**Telling `absent` from `unknown` cost one extra process, and the design did not say how.** It named
the distinction as the first failure scenario and left the mechanism open. `docker image inspect`
exits non-zero for both, so a failed inspect asks a second question —
`docker version --format {{.Server.Version}}`, which answers only when there is a daemon. Failed
inspect plus working version is **absent**; both failing is **unknown**. One extra process, and only
on the path where something is already wrong.

**Two tests passed for the wrong reason before the implementation**, which is worth recording
because a red suite of four looked like four meaningful failures. *"A present image opens as before"*
and *"a refusal comes before a build"* were green against a context that ignored the field entirely.
Only two of the four were real red.

**The build decision carries the whole `open` payload.** The design did not settle this and the
alternative is worse: a decision that said only "build" would make the caller ask twice and get two
answers from one state, and the configuration has to be on disk before the handover whatever the
build does.

**`handsOver` is one line and the design is why it exists at all.** Its two failure scenarios are
opposite halves of one mistake, so the decision is a function over the outcome rather than an `if`
at the call site — the call site being the part no test can reach.

**And `buildInTerminal` was extracted rather than duplicated**, which was not in the design. The open
needs exactly what the build command already did, and two readings of one terminal's exit code would
be two ways to decide whether somebody's project opens. Extracting it left `build()` four lines
shorter and its notification behaviour unchanged.
