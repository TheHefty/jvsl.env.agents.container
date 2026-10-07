# Story: The documents arrive with the image

| | |
|---|---|
| **Status** | **Done** — two `@manual` passes owed |
| **Epic** | `the-extension-carries-the-image` |
| **Date** | 2026-10-02 |

## Summary

`docs/agent/` moves here, travels in the image, and a boot hook writes the modes and the rules to
`/config/.claude/rules/` on every start. FR-84, FR-85 and FR-86. This is also where `.code-server/`
stops being a submodule of this repository.

## Problem

The property worth keeping from the submodule arrangement is that **a rule corrected in one place
reaches every project**, rather than being a copy each project maintains and forgets. Nothing about
that property requires a submodule; it requires delivery.

## Why not the obvious mechanism

An absolute `@/opt/.../MODES.md` in a project's `CLAUDE.md` was rejected on a measurement rather
than a preference. Claude Code classifies an import resolving outside the working directory as
*external*, and:

> The first time Claude Code encounters external imports in a project, it shows an approval dialog
> listing the files. **If you decline, the imports stay disabled and the dialog doesn't appear
> again.**

One click leaves an agent permanently with no modes, no rules and no gates, and nothing ever says
so. A symlink gets the same treatment, and **no setting pre-approves the dialog**. The
documentation names the escape used instead — `~/.claude/rules/`, which in the container is
`/config/.claude/rules/` by both readings, since the image already sets
`CLAUDE_CONFIG_DIR=/config/.claude`.

## Two consequences that are decisions, not details

**`/config/.claude` is bind-mounted from the person's own `~/.claude`.** A hook writing the
documents there would write into their personal configuration and reach every project on that
machine. The generated configuration mounts a volume over `/config/.claude/rules` alone.

**Everything in `rules/` is resident in every session.** `WORKFLOW.md` is linked rather than
imported today, and a consuming monorepo deliberately skips `INITIALIZATION.md` at 13.4 KiB for
exactly this reason. The hook writes what must govern every turn and leaves the rest readable.

## Acceptance criteria

Six scenarios in
[`the-documents-arrive-with-the-image.feature`](the-documents-arrive-with-the-image.feature).

**Two are `@manual`, and they are the only two that matter in the end.** Everything automatable
here asserts that files are in the right place; that an agent session actually opens with the modes
and the rules in its context is a different claim, and nothing inside this repository can see it.
The second is the measurement this whole design rests on: that no approval dialog appears.

## Out of scope

- **Changing any rule.** The documents move; their content is the template's and arrives as it is.
- **The `pt-BR` half.** It moves with the rest and `check-parity.sh` comes with it; deciding
  anything about translation is not this story.

## Tasks

Written after this gate, not before.

| Order | Task | Status |
|---|---|---|
| 1 | [`tasks/the-documents-move-here-with-their-parity-check.md`](tasks/the-documents-move-here-with-their-parity-check.md) | Done — #60 |
| 2 | [`tasks/the-image-carries-them-and-a-hook-writes-them.md`](tasks/the-image-carries-them-and-a-hook-writes-them.md) | Done — #62 |
| 3 | [`tasks/the-submodule-goes.md`](tasks/the-submodule-goes.md) | Done — #64 |

**Provisional.** Task 3 in particular depends on what stories 3 and 4 leave reading the submodule,
which is not knowable yet: `CLAUDE.md:32` imports `MODES.md` from it today and `build.ts` invokes
its `setup`.

## Outcome

Filled in when the status leaves `Draft`.
