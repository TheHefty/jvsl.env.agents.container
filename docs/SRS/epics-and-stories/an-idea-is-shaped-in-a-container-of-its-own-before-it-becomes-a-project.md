# Epic: an idea is shaped in a container of its own before it becomes a project

**An idea is shaped in a container of its own before it becomes a project.**

Agreed on 2026-11-18, from #364, with [the charter's sixth amendment](../../CHARTER.md), which
brings into scope a container that is not a project. Ideas were shaped outside the extension, in a
chat over several sessions, so the step that decides the most happened before the flow and reached
the charter grilling as nothing. The epic closes when a `Brainstorm` command opens an ideation
container, ideas live in the developer's scope with a state, development containers see them
read-only, an idea passes a consolidation gate before it is ready, and *Create project* starts from a
ready idea. Tracked as `jvsl_env_agents_container-5kd`.

**Decided by João Lima before any story** (talked through on 2026-11-17, recorded in #364):

| Decision | Chosen | Considered |
| --- | --- | --- |
| where ideation happens | a container of its own, opened by a `Brainstorm` command | a minimal-image project per idea; ideation on the host, which breaks agents-only-in-the-container |
| where ideas live | `~/.claude/agent-container/ideas/<slug>/IDEA.md`, already bound into every container and visible on the host; on WSL, the distro user's home, as the journal | a named Docker volume, invisible from the host; the journal repository, whose writes are automated and gated |
| the image | `core` only, no stack, under `IDEATION.md` instead of the development rules: no code, one folder per idea, each with a state (`raw`, `exploring`, `ready`, `discarded`, `became project: X`) | — |
| the container's lifetime | persistent: its own `/config` volume, so the session survives between days | ephemeral, keeping only `IDEA.md` |
| memory | `ai-memory` always on, one conversation for all ideas | one conversation per idea |
| ready | purpose and who it is for; decisions, what was discarded and why; the chosen stack or "undecided"; open questions | — |
| the gate out | before `ready`, the agent consolidates into `IDEA.md` what lives only in its memory | — |
| graduating | *Create project* offers a ready idea, pre-selects its stack, copies it to `docs/IDEA.md` (versioned), and marks the original `became project: X`; the initialization interview runs as usual with it alongside | the interview confirming the purpose instead of asking it |
| what development containers see | the ideas folder read-only | read-write |

| # | Story | Why in that order |
|---|---|---|
| 1 | the ideas have a contract | the shape everything below reads and writes |
| 2 | the Brainstorm command opens the ideation container | needs the contract |
| 3 | development containers see the ideas read-only | needs the folder to exist |
| 4 | an idea is consolidated before it is ready | needs the container and its memory |
| 5 | a project is created from a ready idea | needs ready ideas, and their folder protected |
