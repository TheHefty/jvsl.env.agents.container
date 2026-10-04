# AGENTS.md

Read and follow `CLAUDE.md`. It is the canonical instruction file for this repository.

**It imports nothing, and that is the thing it cannot tell you itself.** It used to pull the
normative documents in with `@path` lines, from a `.code-server/` submodule that no longer exists.
Those documents are in this tree now, at `docs/agent/en/`, and `CLAUDE.md` names them rather than
importing them — because an `@path` resolving outside the working directory is classified as an
*external import*, and declining its approval dialog once disables those imports permanently with
nothing said afterwards.

So read `docs/agent/en/MODES.md` and `docs/agent/en/RULES.md`. They are files in this repository;
nothing has to resolve for you to reach them.

**Working without those two is not working under a lighter process.** It is working with no mode, no
rules and no gates — and the gates are in `CLAUDE.md`'s own body for exactly that reason: charter,
SRS, epic, story with its scenarios, task with its design, code, each agreed before the next is
written.
