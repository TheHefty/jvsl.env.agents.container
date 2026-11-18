# Epic: OpenCode runs in the container, sandboxed like Claude and Codex

**`opencode` is in every image, behind the same ai-jail wrapper as `claude` and `codex`, with its
login on the persistent volume.**

Agreed on 2026-10-30. ai-jail 2.6.4 carries an `opencode` preset, and its agent-state mapping already
includes `~/.config/opencode` and `~/.local/share/opencode`, so adding it widens nothing in the
sandbox. Tracked as `jvsl_env_agents_container-2w7`.

**Decided by João Lima, each over a named alternative:**

| | chosen | over |
|---|---|---|
| version | unpinned, `npm install -g opencode-ai`, under the exception the rules record for agent CLIs | a pinned version verified by digest, frozen until somebody bumps it |
| rules | the project's `AGENTS.md`, which OpenCode reads natively, as Codex does | the global `MODES.md` and `RULES.md` written for it as they are for Claude |

| # | Story | Why in that order |
|---|---|---|
| 1 | `opencode` is installed and runs sandboxed, keeping its login | the CLI, its wrapper, and the state directories its login lives in |
