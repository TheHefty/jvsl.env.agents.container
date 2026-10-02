# Epic: the editor composes and builds this project's image

**`whiptail` is retired and the questions it asked are asked by the editor instead.**

Owned by this repository's [`SRS.md`](../../SRS.md) — **FR-61** through **FR-67**, with the decisions
they are the shape of in its fifth amendment.

Story 1 — *the template stops asking* — is the template's and lives in
[`jvsl.env.agents.code-server`](https://github.com/TheHefty/jvsl.env.agents.code-server), under
`docs/PLANNING/the-editor-composes-and-builds/`. It shipped in template `4.0.0`: `setup` asks with
`read` when it has a terminal and reads the manifest when it does not, which is what the two stories
here stand on.

## Stories in this repository

| # | Story | Status |
|---|---|---|
| 2 | [`the-editor-asks`](the-editor-asks/) | **Done** — extension `v0.3.0`. Two `@manual` passes owed |
| 3 | [`the-editor-builds`](the-editor-builds/) | **Done** — extension `v0.3.0`. Three `@manual` passes owed |

## What is owed

Five `@manual` scenarios across the two stories: no CI can watch a terminal, read a tree, or judge
whether a list matches the template the host actually has.

| owed | story |
|---|---|
| the stacks offered are the ones the template has | 2 |
| the view says what is selected | 2 |
| the build is the script, not a command typed into a shell | 3 |
| the build really runs, and reads | 3 |
| closing the terminal stops the build | 3 |

All five need the monorepo's submodule at `v5.0.0` and `.code-server/setup` rerun, because what the
questions offer and what the build runs both come from the template.

**The order is fixed by what each needs**, not by preference: story 2 needs a manifest format to
write and a `setup` to hand it to; story 3 needs story 2's answers to exist before there is anything
to build from.
