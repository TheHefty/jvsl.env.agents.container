# Story: A project needs nothing but the extension

| | |
|---|---|
| **Status** | Draft |
| **Epic** | `the-extension-carries-the-image` |
| **Date** | 2026-10-02 |

## Summary

`CLAUDE.md` and `AGENTS.md` ship in the bundle and are written into a project **when absent**.
Activation stops depending on a submodule. FR-83 and FR-82.

## Problem

A project that installs this extension and nothing else has no instruction files, and nothing tells
the agent how the project is worked on. The files have to come from somewhere, and the only place
left is the extension.

## The risk, and it is destructive rather than merely wrong

**These are tracked files carrying a project's own standing answers.** The reference monorepo's
`CLAUDE.md` is 20 KiB of them; this extension's own is another. Writing over one destroys work in a
way the generated `devcontainer.json` cannot, because that file is gitignored and disposable and
these are neither.

The pattern already exists in this codebase and is the one to copy — `src/devcontainer.ts`:

> Anything else — including a file that cannot be parsed — is somebody's work, and the open refuses
> rather than overwriting it.

## The second risk is quieter

**Every project built on the template carries `.code-server/` today.** Activation currently depends
on it. Changing activation to the manifest is one line; the thing to get right is that a project
which *still has* the submodule keeps opening. An extension that refuses the arrangement it is
replacing strands everybody mid-migration, and the migration is the whole point.

## Acceptance criteria

Four scenarios in
[`a-project-needs-nothing-but-the-extension.feature`](a-project-needs-nothing-but-the-extension.feature).
None is `@manual`: all four are decisions over a directory's contents, which is what `decideOpen`
already is — a pure function over what the host looks like.

## Out of scope

- **What the shipped `CLAUDE.md` says.** It is the template's `docs/agent/` material and arrives
  with story 5; this story is about writing a file, not about its content.
- **Removing `.code-server/` from this repository** — story 5.

## Tasks

Written after this gate, not before.

| Order | Task | Status |
|---|---|---|
| 1 | the instruction files are written when absent | not written |
| 2 | activation does not depend on a submodule | not written |

**Provisional**, for the reason given in story 3's table: these are sketched from the FRs rather
than decomposed from measurement.

## Outcome

Filled in when the status leaves `Draft`.
