---
name: retro
description: The day's retrospective with the developer — report what was discovered, what surprised, what went wrong and what was decided without asking, take the developer's own "what I learned" line, and write the day's journal entry. Use after the review at the end of the day, or when the developer asks for the retro. Never skipped.
---

# The retro

The second part of the end-of-day block (review, retro, refinement), and **the one ceremony that is never skipped**. On a short day it is short, but it runs.

Its point is that what you found while working comes back to the developer, instead of staying in commits and documents. **You report. The developer writes what they learned.** You never write their line for them.

## 1. The tracker has to be on

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/needs-tracker
```

If it exits non-zero, tell the developer the line it printed, word for word, and stop.

## 2. Gather the day

Run, from the project's repository:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/retro-gather
```

It lists the items touched today and the commits made today, both by the local date. Use it to remember the day, and as the start of the entry's Links.

## 3. Report, under four headings

- **Discovered**: what you found that was not known before (a default, a bug, how a library behaves, a constraint). For each one, say **how you found it** (the command, the failing test, the file and line) and **why it matters** to this project.
- **Surprised**: what behaved differently from what you expected.
- **Went wrong**: dead ends, reverted attempts, wrong assumptions, your own included.
- **Decided alone**: everything you chose without asking — a name, a default, a library, a workaround — with what you chose and why. Leave nothing out to look better. If there was nothing, say so.

## 4. What only the developer gives

- **What I learned**: ask the developer for their line. You may offer a draft for them to change or approve, but what goes in the entry is what they wrote or approved.
- **Blog candidates**: ask whether any discovery is worth writing about. Mark only the ones they choose.
- **Left open**: ask what is left for tomorrow. Tomorrow's daily reads this section.

## 5. Write the entry

Write the body to a file, with these sections in this order:

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

Then run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/journal-write <file>
```

It writes today's entry, or rewrites it if the retro already ran today. It refuses an entry missing a section, an empty "What I learned", or an empty "Decided alone" (write "Nothing." when there was nothing). If it refuses, fix what it names. Never fill the developer's line yourself to get past it.

## 6. Hand over

Tell the developer the entry's id. Refinement comes next.
