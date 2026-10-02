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
| 2 | [`the-editor-asks`](the-editor-asks/) | Draft |
| 3 | [`the-editor-builds`](the-editor-builds/) | Draft |

**The order is fixed by what each needs**, not by preference: story 2 needs a manifest format to
write and a `setup` to hand it to; story 3 needs story 2's answers to exist before there is anything
to build from.
