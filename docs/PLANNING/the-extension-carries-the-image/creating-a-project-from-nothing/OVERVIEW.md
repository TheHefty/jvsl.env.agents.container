# Story: Creating a project from nothing

| | |
|---|---|
| **Status** | Draft |
| **Epic** | `the-extension-carries-the-image` |
| **Date** | 2026-10-02 |

## Summary

A directory, the five questions plus `ai-memory` and a location, a scaffolded project, `git init`
and one commit — and then the flow from story 6 takes over. FR-90 and FR-91.

## The shape is forced by a measurement, not chosen

`remote-containers.reopenInContainer` — already what this extension invokes, `open.ts:6` — **takes
no folder and acts on the current window.** So creating is two-phase by construction: scaffold,
`vscode.openFolder`, which **restarts the extension host and discards everything in memory**, then
continue on activation in the new folder.

**The compensation is that the flows converge.** Once the manifest exists, creating *is* opening,
and there is one path rather than two. That is scenario 5 and it is written as a requirement rather
than left as an implementation note, because two flows that look alike and are implemented twice
diverge — which is why the launcher was deleted rather than kept as a fallback.

The handoff has to survive the reload and must not be written into the project, which is what
extension-scoped state is for.

## The destructive risk

**This story makes the extension write version control.** `git init` and a commit, into a directory
the person chose. If that directory is already a repository, or already has files, scaffolding over
it destroys something nobody offered up — and unlike the generated `devcontainer.json`, there is no
gitignore making it disposable.

The rule is the one story 4 uses for the instruction files: **empty or not a repository, or it
refuses and names what it found.**

## Acceptance criteria

Six scenarios in
[`creating-a-project-from-nothing.feature`](creating-a-project-from-nothing.feature). One is
`@manual`: what survives a window reload is not observable from inside the session about to be
discarded.

## Out of scope

- **What the scaffolded project contains beyond the manifest and the instruction files.** No
  source tree, no language scaffolding; the stacks decide the image, not the repository's shape.
- **The panel** — story 8.

## Tasks

Written after this gate, not before.

| Order | Task | Status |
|---|---|---|
| 1 | [`tasks/the-questions-gain-a-location-and-ai-memory.md`](tasks/the-questions-gain-a-location-and-ai-memory.md) | Done — #77 |
| 2 | [`tasks/scaffolding-and-refusing-somebodys-work.md`](tasks/scaffolding-and-refusing-somebodys-work.md) | Draft |
| 3 | the handoff across the reload | not written |

**Provisional**, and the third most of all: how a handoff is persisted and read back depends on
what story 6 leaves at activation time.

## Outcome

Filled in when the status leaves `Draft`.
