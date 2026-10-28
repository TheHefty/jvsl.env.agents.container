# The working day

How a day of work with the agent runs, in a project that has a tracker. Agents write most of the
code; the decisions stay with the developer, and what the agent discovers along the way has to come
back to them rather than staying in commits and documents. Four ceremonies are that return path.

They ship as the image's `agent-container` plugin, which the `claude` wrapper loads, so every project
has them without installing anything. The parts that bind every turn are also in
[Rules](RULES.md), under *The working day*; this is the rest, read when it is the subject.

Paths outside this folder are written as code rather than as links, for the reason given in
[Rules](RULES.md).

## The day

| Ceremony | Skill | When | What it leaves |
|---|---|---|---|
| Daily | `agent-container:daily` | start of the day | today's agreed tasks, each with its done criterion, claimed in the developer's name |
| Review | `agent-container:review` | end of the day, first | each task accepted in the developer's own words, or reopened with what is missing |
| Retro | `agent-container:retro` | end of the day, second | the day's journal entry |
| Refinement | `agent-container:refine` | end of the day, last | the next stories and tasks, proposed and agreed |

**The ceremonies are the chain's calendar, not a way around it.** Every link of the chain in
[Workflow](WORKFLOW.md) is still agreed before it is written. Refinement is where stories and tasks
are proposed and agreed, and the daily picks only what was agreed. An item that reaches a daily raw
goes back to refinement rather than being built that day.

Each ceremony runs `needs-tracker` first and stops, in one line saying how to turn the tracker on,
in a project whose manifest does not say `"beads": true`.

## The daily

The daily reads the tracker with `daily-brief`, which shows in progress, blocked with what blocks
it, ready, and what yesterday's journal entry left open. It proposes a short list. **The developer
chooses**, and nothing is marked in progress until they confirm.

`daily-check` stands between the choice and the claim. It passes only an agreed, open task with no
open blocker and a done criterion. **A task's done criterion is its `acceptance_criteria`.** When it
is missing, the daily asks the developer and writes their answer with `bd update <id> --acceptance`.
It never writes one itself. The claim is `bd update <id> --claim --actor "<name>"`, in the
developer's name, taken from `git config user.name`. Inside the sandbox bd would otherwise record
`unknown`.

The daily writes no code.

## The end-of-day block

Review, retro and refinement run together at the end of the day, in that order, in thirty to
forty-five minutes. The review settles what was done, the retro turns it into what was learned, and
refinement prepares what comes next.

## Done is explained

**Passing tests are necessary and not enough: a task is done when the developer can explain it.**
The review shows each task against its criterion and asks the developer to explain the change in
their own words. When they cannot yet, the agent walks through it with them until they can.
`review-accept` refuses an acceptance without those words, and keeps them verbatim in the task's
notes.

**Accepting is not merging.** An accepted task closes when its pull request merges, which
`review-settle` checks with `gh`. A pull request that is open, closed without merging, or missing
leaves the task open, and the reason is said. A `gh` that cannot answer is never read as merged.
`review-reopen` keeps what is missing.

## The journal

The retro is **never skipped**. On a short day it is short, but it runs. The agent reports four
things: what it discovered, with how it found each one and why it matters; what surprised it; what
went wrong; and everything it decided alone. The developer writes or approves the line on what they
learned. The agent never writes that line on its own.

The day's entry lives in the tracker, not in a file. It is a `chore` labelled `journal`, closed when
it is written so no daily offers it as work, and keyed by metadata `day`. The day is the local date,
so a retro held late in the evening belongs to that day. `journal-write` writes it, and a second
retro on the same day rewrites the same entry. Its sections, in this order and named exactly so,
because the daily and the study skill read them:

```
## Discovered
### <one discovery>
How it was found: …
Why it matters: …
Blog candidate: yes | no
## Surprised
## Went wrong
## Decided alone
## What I learned
## Left open
## Links
```

`journal-write` refuses an entry without "What I learned", or with "Decided alone" empty; that
section says "Nothing." when there was nothing. `Blog candidate: yes` marks a discovery the developer
chose to write about, and labels the entry `blog-candidate` for the study skill. When the last day
with work has no entry, the next daily says the retro was skipped.

## What a task records

- **Its done criterion**, in `acceptance_criteria`, written at refinement.
- **Its pull request**, recorded when the pull request is opened, with
  `bd update <id> --set-metadata pr=<n>`. The review reads it to show what changed and to close the
  task when it merges. It is metadata, not `external_ref`, which holds where an item came from, such
  as `gh-154` for a debt opened as a GitHub issue. A debt fixed by a pull request has both.
- **Its acceptance**, as the developer's words, in its notes.

## Where it does not apply

A project without the tracker has no ceremonies. The skills are in its image and refuse in one line.
Its work follows [Workflow](WORKFLOW.md) as before.
