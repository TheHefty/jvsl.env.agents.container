# Epic: a project is configured by answering, never by editing a file by hand

**Whatever switches a project's container on or off is asked when the project is created, opened
or configured, and the answer is written for the developer.**

Agreed on 2026-10-30, after verifying 1.14.1. The work tracker is switched on by `"beads": true` in
`.agent-container.stack.json`, and nothing asked for it: it was written by hand. ai-memory's marker,
`.ai-memory.toml`, was asked by Create only, never by the configuration Open runs. Tracked as
`jvsl_env_agents_container-d27`.

| # | Story | Why in that order |
|---|---|---|
| 1 | Open and Create ask whether the project uses beads and ai-memory | the two switches a project has today; turning one off removes the switch and leaves the data, and says so |
