# Data and legal

**No personal data is processed by the extension's own code.** The extension runs entirely on the
user's machine, collects nothing, transmits nothing, and has no telemetry and no server component.
There is no controller, no legal basis to record and no retention period, because there is no
processing. Two things it *reads* are worth naming so the record is complete rather than merely
short: the project's own files on disk, and the host's hardware characteristics (core count,
presence of device nodes). Neither leaves the machine, and neither is written anywhere but into
the generated configuration and the output channel.

That record is true of the extension's own code and false of the system it composes and builds.
The image it ships runs three agent CLIs and the services they depend on, and those send data off
the machine. This section is the data map for that system: each flow, where the data rests, for how
long, and how it is deleted. Where deletion does not exist, it says so.

## Agents to their providers

The image installs three agent CLIs — Claude Code (`@anthropic-ai/claude-code`), Codex
(`@openai/codex`) and OpenCode (`opencode-ai`) — and the developer uses them to work on the
project. Each sends prompts, code and tool results to its provider: Anthropic, OpenAI and
OpenCode's respectively. That data leaves the machine on every request, and its retention and
deletion are the provider's, under the provider's terms — this project controls none of it and
has no copy of it.

The image sets `DO_NOT_TRACK=1`, which bd (beads) honours; nothing equivalent was found for the
three agent CLIs, and none is set for them. Whether any of them reports usage telemetry is their
own behaviour, not this project's setting.

## ai-memory

When a project opts in (`.ai-memory.toml`), ai-memory captures prompts and tool excerpts and
keeps them under `/config/ai-memory` on the persistent `/config` volume: a git-backed wiki plus a
SQLite index, served by the per-container MCP server on loopback. A one-time migration to the
Open Knowledge Format archives a full copy of the store under `/config/ai-memory-backups` on the
same volume before rewriting it; that archive is not removed afterwards.

- **Where it rests:** `/config/ai-memory` (store) and `/config/ai-memory-backups` (migration
  archive), both on the project's named `/config` volume, which survives rebuilds.
- **For how long:** indefinitely. There is no retention limit and no automatic purge; the
  `forget-sweep` command exists in the binary but nothing in this image schedules it.
- **How it is deleted:** manually — remove `/config/ai-memory` and `/config/ai-memory-backups`
  from the volume, or delete the volume. Nothing in the extension or the image does it.

## The developer's journal

The working-day ceremonies write a journal entry per day. `journal-flush` sends each entry in the
outbox to the developer's own private GitHub repository, configured in
`~/.claude/agent-container/journal.json` (inside the container `~` is `/config`, so
`/config/.claude/agent-container/journal.json`), as `owner/repo`. An empty or unset repository
keeps the entries in the local outbox instead of sending them. A public repository is refused, so
an entry is never sent where anyone can read it.

- **Where it rests:** the outbox under `~/.claude/agent-container/journal-outbox` until it is
  sent; afterwards in the developer's private repository, as `<project>/<day>.md`.
- **For how long:** in the repository, until the developer deletes it there. In the outbox,
  until the next successful flush.
- **How it is deleted:** delete the file from the repository, or clear the outbox directory.
  Removing the repository setting keeps future entries local.

## Telemetry

- **beads (bd):** `DO_NOT_TRACK=1` is set in the image and forwarded into the agents' sandbox,
  so bd reports nothing — from the boot hook, from a terminal, and from the agent. Measured on
  2026-10-07, after dozens of commands had already reported from this environment; the decision
  was that nothing leaves the machine without a decision.
- **The three agent CLIs:** no equivalent setting was found for them, and none is set. Their
  behaviour is their own.
- **ai-memory:** runs on loopback inside the container; its port is never published and nested
  containers cannot reach it. Nothing is sent by it except to the loopback MCP clients.
- **The extension itself:** no telemetry, as stated above.

## The extension's own processing

The extension reads the project's files on disk and the host's hardware characteristics, writes
the generated configuration and the image's Dockerfile, and opens the project. None of it leaves
the machine, and none of it is transmitted. Adding telemetry would turn this section into a data
map and is named in the charter as a change that requires re-grilling it.