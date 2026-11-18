# Epic: the developer's journal is theirs

**The retro's journal is written to a private repository of the developer's own, never to a
project's tracker.**

Agreed on 2026-10-28, from the first live project report. The journal lived in the tracker, as the
ceremonies epic decided, and the tracker travels to the project's remote as `refs/dolt/data`. This
repository is public, so the first entry, with the developer's "What I learned", was published with
the next push. What a person writes about what they learned changes when they know it is public.
The epic closes when a retro writes its entry to the private repository, the next planning reads it
from there, and no journal entry remains in this project's tracker. Tracked as
`jvsl_env_agents_container-4u0`.

**Decided by João Lima, each over a named alternative, the facts measured first:**

| | chosen | over |
|---|---|---|
| where | one private repository for all the developer's projects, a folder per project | one repository per project; keeping the journal in the tracker and saying so; a local-only journal; choosing by the project's visibility |
| named in | `~/.claude/agent-container/journal.json` — the container's `/config/.claude` is the host's `~/.claude`, so one file serves every project | a VS Code setting, at the cost of a new configuration generation and a path into the sandbox |
| written by | GitHub's contents API through the `gh` the sandbox already has, which carries the `repo` scope | a clone and `git push`, which would widen the sandbox's map |
| when it cannot | the entry waits in `~/.claude/agent-container/journal-outbox/`, on the host's disk, and is sent later | refusing, which would make a day without a network a day without a retro |
| a public repository | refused as the journal, the entry kept in the outbox | trusting the name |
| what is already published | moved to the private repository and deleted from the tracker; the tracker's history still holds it, and the move says so | leaving it |

**It amends the ceremonies epic**: the retro writes the entry to the private repository, the
planning reads yesterday's "Left open" from there and from the outbox, and the study skill finds the
blog candidates there.

| # | Story | Why in that order |
|---|---|---|
| 1 | the retro writes the entry to the developer's private repository | everything below reads what it writes |
| 2 | the journal's readers read it from the private repository | the planning and the study skill, with the outbox |
| 3 | the entries in a tracker move to the private repository | needs 1 to write them somewhere first |
| 4 | the working agreement says the journal is private | normative, both languages; last, so it describes what exists |
| 5 | project setup asks for the developer's journal repository | Create, Configure and Open ask only when Beads is on, storing it in the shared developer home |
