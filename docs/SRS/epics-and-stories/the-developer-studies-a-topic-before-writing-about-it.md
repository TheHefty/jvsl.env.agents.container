# Epic: the developer studies a topic before writing about it

**A topic the agent found becomes a guide the developer reads before writing, tracked until
published.**

Agreed on 2026-10-28, from #227, and after [the working day ends with the developer knowing what the agent found](the-working-day-ends-with-the-developer-knowing-what-the-agent-found.md), whose journal carries the
`blog-candidate` marks. Writing about what the agent discovered without studying it first publishes
knowledge that is not yours. The epic closes when a topic marked in a retro becomes material, is
studied in the extension's Study view with every answer hidden until attempted, and is tracked to
published. Tracked as `jvsl_env_agents_container-zxw`.

**Decided by João Lima before any story:**

- **The material is in the repository; the attempts are not.** `docs/study/<slug>/guide.md` and
  `practice.json` are versioned and reviewed like any document. `attempts.json` is ignored by git:
  what the developer writes while getting it wrong does not go into a repository that may be
  public. Changing machines restarts the attempts, not the material.
- **`docs/REPORT.md` is ignored by git.** A snapshot regenerated on demand; committed, it is stale
  the day after and read as true.
- **The topic's state is the tracker's own.** Not studied is `open`, studying is `in_progress`,
  ready to write is the label `ready-to-write`, published is `closed` with the post's link as the
  reason; every topic carries the label `study`.

The Study view sits beside *Show the Work* and reads the tracker the way the board does, through
`bd export` in the container.

| # | Story | Why in that order |
|---|---|---|
| 1 | the study material has a contract | a JSON Schema for both files; everything below writes or reads it |
| 2 | the project report | read-only; the other source of topics, beside the journal |
| 3 | the study skill builds a topic | needs the contract; creates the topic's tracker item |
| 4 | the Study view | needs material to show |
| 5 | the view moves the topic in the tracker | needs the view; ready to write and published |

**Amended on 2026-10-28 by João Lima, after studying the first topic in the view: the practice
leaves the study.** A topic is its `guide.md` alone. There is no `practice.json`, no `attempts.json`
and no hidden answers. Opening a topic starts the study, and *ready to write* is the developer's word
rather than every item attempted: nothing a script can check stands in for having studied, so it is
not pretended. The decisions above about attempts no longer apply.
