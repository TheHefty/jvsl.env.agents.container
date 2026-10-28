# agent-container

The plugin the agent container's image carries at `/opt/jvsl/plugins/agent-container`. The `claude`
wrapper loads it with `--plugin-dir`, so every jailed session has it and nothing is written to
`~/.claude`, which inside the container is the developer's own, bound from the host.

It holds the ceremonies of a working day with the agent — daily, review, retro and refinement — each
added by its own story of the epic *the working day ends with the developer knowing what the agent
found*. They need the project's work tracker: `bin/needs-tracker` is the first step of each, and
refuses in one line, saying how to turn the tracker on, when the manifest does not have
`"beads": true`.

`/usr/bin/claude`, called by its absolute path, is the unjailed escape hatch and loads no plugin.

| skill | what it does |
|---|---|
| `daily` | starts the day: reads the tracker and yesterday's journal, proposes today's tasks, claims only what the developer confirms (`bin/daily-brief`, `bin/daily-check`) |
