---
status: Done
story: the-editor-composes-and-builds/the-editor-builds
epic: the-editor-composes-and-builds
pr: 27
depends-on: [the-questions-produce-a-manifest]
---

# Task: the-build-runs-in-a-terminal

## Summary

A `Dev Container: Build the Image` command and an action on the view. The terminal's process is
`setup`; the host checks that `init` performed are here; the outcome lands on the view.

**No design section.** The story's gate settled every trade-off in it — the terminal over a Task and
over `sendText`, checks on activation as well as before a build, failure state on the view rather than
in a notification. What follows is what was decided while writing it.

## What it does

| | |
|---|---|
| the command | `/bin/sh -c 'exec "$0" </dev/null'` with the script's path as `$0` |
| the host checks | `jq`, `docker` present, `docker` usable — bounded at 2s, with the package name per manager |
| the outcome | `ok`, `failed` or `cancelled`, written to the output channel and shown on the view |

**`/bin/sh` is there for one reason and the reason is in the code.** `createTerminal` gives its process
a pty, and a pty is what `setup` uses to decide whether to ask, so without `</dev/null` the build stops
on questions the editor has already answered. There is no stdin option on `createTerminal`. This is
not what `sendText` was rejected for: nothing is typed, nothing is editable, the exit code is
observable, and **the path arrives as an argument rather than inside the command string**, so a
directory with a space in it is not a quoting problem — which has its own test.

**No exit code is a cancellation.** A terminal closed mid-build leaves none, and calling that a failure
makes "I stopped it" look like "it broke". FR-66 asks for this specifically because the two are
otherwise indistinguishable.

**An unknown host check does not block.** `docker info` hangs on an unreachable daemon rather than
failing, so it is raced against a 2-second timer and a timeout reports `unknown`. A build is still
attempted: refusing on "I could not tell" turns a slow daemon into a broken extension, and if docker
really is unusable the build fails with docker's own message, which names the cause better than a guess
here would.

**The last build is session state, not project state.** It lives on the view object rather than on
disk: what the last build did is not something a project carries, and writing it into the manifest
would be inventing a key `setup` does not own.

**No row until there has been a build**, rather than "last build: never" — a row that is always there
and says nothing on the first open.

## Decided while writing it

**The view is constructed before the commands that close over it.** The closure would resolve either
way, because the callback runs after activation finishes — and a reader should not have to know that to
be sure. Four lines moved, and a comment saying why.

**The package table is three entries, not eleven.** `packageFor` covers `jq` and `docker` across apt,
dnf and pacman, because that is what the host needs now. The shell table it replaces had eleven tools
in it, nine of which were the launcher's and left with it.

## Tests

Thirteen in `src/build.test.ts` and two added to `src/view.test.ts`, 101 in all. None needs an editor:
what a mock of `createTerminal` would assert is that it was handed what `buildCommand` returned.

**Two were watched failing against deliberately wrong implementations:** `buildOutcome` without the
`undefined` case reports a cancellation as a failure, and an `unknown` docker marked blocking refuses
to build on a slow daemon. Those are the two decisions FR-66 is about.

## Three worst failure scenarios

| # | Scenario | How it manifests | Test that catches it |
|---|---|---|---|
| 1 | The redirect is lost and `setup` asks inside the build | The terminal sits on a question the editor already answered. Visible, which is the direction to fail in — but it looks like a hung build until somebody reads the prompt | `buildCommand`'s shape is asserted, including that the redirect is in the command string and the path is not |
| 2 | A cancelled build is reported as a failure | "I stopped it" reads as "it broke", and the view says so persistently. The reverse — a failure read as a cancellation — is worse still, because nothing then says anything is wrong | `buildOutcome(undefined)`, watched failing |
| 3 | A host check hangs and takes activation with it | A window that opens slowly with nothing saying why, on every project. The check that does this is `docker info` against an unreachable daemon, which is a normal state on a laptop | The `unknown` state is non-blocking and tested; the 2-second bound is in the caller rather than the pure function, and is not unit-tested |

## Outcome

Implemented in #27. The template half of FR-67 — deleting `init`, `packages.sh`, its test and the
`host-packages` CI job — is the story's second task and goes after this ships, for the reason the epic's
README gives: deleting a diagnosis before its replacement exists leaves releases in which neither side
names a cause.

**Two `@manual` scenarios are owed and are the story's**: that the build really runs and streams, and
that closing the terminal reads as cancelled rather than failed. Neither is reachable from a test that
has no terminal.
