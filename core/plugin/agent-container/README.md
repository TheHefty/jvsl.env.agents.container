# agent-container

The plugin the agent container's image carries at `/opt/jvsl/plugins/agent-container`. The `claude`
wrapper loads it with `--plugin-dir`, so every jailed session has it and nothing is written to
`~/.claude`, which inside the container is the developer's own, bound from the host.

It holds the ceremonies of a working day with the agent — planning, review, retro and refinement — each
added by its own story of the epic *the working day ends with the developer knowing what the agent
found*. They need the project's work tracker: `bin/needs-tracker` is the first step of each, and
refuses in one line, saying how to turn the tracker on, when the manifest does not have
`"beads": true`.

`/usr/bin/claude`, called by its absolute path, is the unjailed escape hatch and loads no plugin.

| skill | what it does |
|---|---|
| `planning` | starts the day: reads the tracker and yesterday's journal, proposes today's tasks, claims only what the developer confirms (`bin/planning-brief`, `bin/planning-check`; the journal through `bin/journal-read`, and entries left in a tracker moved by `bin/journal-move`) |
| `review` | ends the day's work: each task shown against its criterion, accepted only in the developer's own words, closed when its pull request merges (`bin/review-list`, `bin/review-accept`, `bin/review-reopen`, `bin/review-settle`) |
| `retro` | the day's retrospective: discovered, surprised, went wrong, decided alone, and the developer's own "what I learned", written as the day's journal entry, to the developer's private repository or kept in an outbox until it can be (`bin/retro-gather`, `bin/journal-write`, `bin/journal-flush`) |
| `refine` | the day's last ceremony: grills the next items, proposes stories and tasks, agrees or rejects them on the developer's word (`bin/refine-candidates`, `bin/refine-propose`, `bin/refine-agree`, `bin/refine-reject`) |
| `project-report` | a read-only report on the project into `docs/REPORT.md`, which git ignores; every claim cites a file, and implicit decisions are given no invented reason (`bin/report-guard`, `bin/report-exclude`, `bin/report-check`). It does not need the tracker |
| `study` | builds a topic's guide in `docs/study/<slug>/` from a blog candidate, a report topic or the developer's own, and tracks it as a `study` task; never writes the post (`bin/study-sources`, `bin/study-slug`, `bin/study-track`, `bin/study-validate`) |

The extension's Study view moves a topic through the tracker with `bin/study-move <slug> started|ready|published [link]`, the one script it runs: ready is the developer's word, published only once ready and with an http(s) link, and never on anything but a `study` task.
