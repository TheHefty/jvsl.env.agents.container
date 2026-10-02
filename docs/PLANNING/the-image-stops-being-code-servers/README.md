# Epic: the image stops being code-server's

**The image carries no editor, and nothing in it exists for one.**

Owned by this repository's [`srs/`](../../srs/) — **FR-71** through **FR-74**, with the decisions
they are the shape of in its sixth amendment.

Stories 1, 2 and 4 are the template's and live in
[`jvsl.env.agents.code-server`](https://github.com/TheHefty/jvsl.env.agents.code-server), under
`docs/PLANNING/the-image-stops-being-code-servers/`. They are where the base changes, the settings
find their place, and two stacks stop depending on Ubuntu.

## Stories in this repository

| # | Story | Status |
|---|---|---|
| 3 | [`the-configuration-declares-no-editors-variable`](the-configuration-declares-no-editors-variable/) | **Done** |

**It is last, and nothing is blocked on it.** An image that ignores `PASSWORD` makes it a dead
variable rather than a fault, so this can land after the base swap without anything waiting.
