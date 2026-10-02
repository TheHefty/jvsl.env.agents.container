---
status: Done
story: the-extension-carries-the-image/the-extension-composes-and-builds
epic: the-extension-carries-the-image
pr: 52
---

# Task: the-extension-composes-from-what-it-carries

# Summary

The extension computes the path to its own `core/` and `stacks/`, composes a project's Dockerfile
from them with `core/compose-dockerfile.sh`, and builds it. `setup` stops being what the build
invokes.

## What the measurement found, and it is not what the story's sketch assumed

**Nothing in `src/` has any notion of a file the extension carries.** There is not one
`extensionPath` or `extensionUri` in the whole of `src/`; every path is workspace-relative. The
only access to extension-owned data is `context.extension?.packageJSON`, which is metadata rather
than a file. So this task introduces the concept, and that is most of it.

Two concrete consequences:

| | |
|---|---|
| `src/extension.ts:291` | `join(folder.uri.fsPath, '.code-server', 'setup')` — the build's target is computed from the **workspace** |
| `build()` | takes `write` and `view` and **not** `context`, so its signature changes before it can read anything the extension owns |

## The dev-versus-installed seam, which turns out to be closed already

The story named the risk: a developer runs from a checkout and a user runs from an installed
`.vsix`, and a path that works in one and not the other passes every test here and fails in
somebody's editor.

**It is closed, and by a decision taken two stories ago for a different reason.** Task 1 of story 1
merged `core/` and `stacks/` at their original paths rather than under a prefix, because the names
were free. So:

- in a checkout, `context.extensionPath` is the repository root, which has `core/`
- in an installation, the `.vsix` holds `extension/core/…` and the editor extracts the contents of
  `extension/` to `extensionPath`, which therefore has `core/`

**`join(context.extensionPath, 'core')` is the same expression in both.** That is worth an
assertion rather than a sentence, because it is true by a coincidence of two decisions and nothing
holds it true on purpose.

## Proposal

A `carried(context, …path)` in `src/template.ts` — the file that already owns questions about the
template — returning a path under `extensionPath`. `build()` gains the context. Composition shells
out to the carried `core/compose-dockerfile.sh`.

**Shelling out rather than reimplementing composition in TypeScript** is the decision this task
takes, and the story said it has to be justified. The alternative is a composition the extension
can unit-test without a shell, and it is rejected because story 1's seventh scenario requires CI
and the extension to use **one** implementation: CI composes with that script, and a second
composition in TypeScript would be a second thing to keep in step, with the failure being an image
CI verifies and nobody runs.

## Three worst failure scenarios

**1. The path works in development and not in an installation.** Every test here runs from a
checkout. The assertion that closes it cannot be "the expression is right" — it has to read the
package: the `.vsix` contains `extension/core/compose-dockerfile.sh`, so the installed layout has
it where the expression looks.

**2. The composed Dockerfile is not the one CI composes.** Shelling out makes them the same
script; it does not make them the same **invocation**. `compose-dockerfile.sh` reads
`STACKS_DIR` and the manifest, and an extension passing a different root composes a different file
with the same code. Whatever CI does with it, the extension must do identically.

**3. The build runs with the workspace's `setup` still present and wins the race.** Every project
built on the template has `.code-server/setup` today. If the extension keeps the old path as a
fallback, the thing that runs depends on which project it is — and the version in a project's
submodule is whatever that project last bumped to. There is no fallback: the carried content is
the only content.

## Verification

| Test | Asserts |
|---|---|
| `template.test.ts` | `carried()` resolves under `extensionPath` and not under the workspace |
| `vsix.test.ts` | the package contains `core/compose-dockerfile.sh` at the path the expression computes — the dev/installed seam, read from the artifact rather than argued |
| `build.test.ts` | the build command names the carried script, and names no path under `.code-server/` |
| a composition test | the extension's invocation and CI's produce byte-identical output for one manifest |

The fourth is the one that holds scenario 2, and it is the one most likely to need a fixture rather
than a real build.

## Outcome

Implemented in #52. 125 unit tests, 10 bundle, typecheck clean.

**Three places computed a path into the project's submodule, not one.** The measurement found the
build; wiring it found that the **questions** read the stacks from there too — so a project with no
`.code-server/` could not even be *configured*, which this task did not know when it was written.
All three are `carried(extensionPath, …)` now, and `SelectionView` takes the path at construction,
because what the extension carries is not a property of the project being viewed.

**The redirect was wrong, and a test regex found it by accident.** `A; B </dev/null` redirects B
alone — so the composer, the step that would actually ask something, kept the terminal's pty on
stdin. The whole script is grouped now and the test asserts the group rather than the last line. I
was writing a regex for the build context and the input it printed showed the redirect in the wrong
place.

**One assertion of mine was wrong in a way worth keeping.** *"Nothing in the build names a path
under `.code-server`"* failed — on the manifest, which is called `.code-server.stack.json`, lives
at the workspace root, and keeps that name after the submodule is gone. **The slash is the whole
assertion**, and forbidding the substring forbade the file the build is supposed to read.

**`buildCommand` is deleted, and the typecheck did not notice its unused import.** With `setup` out
of the build path it had no caller, and two ways to start a build is how one outlives its reason.
Six comments still named it afterwards; a reference that goes nowhere is worse than none, because a
reader follows it and finds the reasoning missing rather than moved.

**The dev-versus-installed seam is asserted from two sides**, as the design said: `template.test.ts`
pins the expression and `vsix.test.ts` reads the artifact for
`core/compose-dockerfile.sh`, `core/Dockerfile.frag` and `core/versions.json`. Neither alone is the
claim. The story's `@manual` pass is still what closes it.

**And one decision this design did not anticipate needing.** An unreadable manifest means no stacks
rather than an error: the build composes core alone, which is a working image. Refusing to build
because a file that could not be parsed *might* have named something is worse, and the questions
are what refuse an unreadable manifest — they refuse it rather than overwriting it.
