# Epic: Beads tracks the work

**Status, order and blocking stop living in markdown.**

Grilled on 2026-10-05, before any story was written and before any code. The SRS carries the
requirements (FR-100 to FR-109) and the epic's reasoning; this directory carries the stories.

## What the grilling changed

**It was proposed as "integrate Beads", and what it settled was a boundary rather than an
integration.** Six things came out of it that the proposal did not contain:

1. **The storage engine is embedded** — `bd init` runs Dolt in-process. The question the epic was
   expected to turn on (an s6 service, resident memory) **does not apply**. The real cost is image
   size: 50.8 MB compressed.
2. **`bd dep tree` and `bd graph` exist.** An earlier reading of the project's README said otherwise
   and was wrong; the CLI reference lists both. Recorded because a fact stated confidently and
   corrected is worth more than a fact nobody checked.
3. **`--external-ref` exists**, documented for exactly this — *"gh-9, jira-ABC, Linear URL"*. The
   two-layer model needed a field and did not need a convention.
4. **Beads ships `bd remember`.** Nobody had looked. Two memories of the same kind is how both stop
   being trusted, so the boundary is a requirement (FR-107) rather than an understanding.
5. **`bd init` is explicit** — nothing works before it. That is the whole reason a boot hook exists.
6. **The `--design` and `--acceptance` fields are a trap.** Beads has fields for precisely what the
   decision keeps in markdown. Left empty with a pointer, and written down, because the agent will
   otherwise fill a field that exists.

## The decisions, and what each costs

| | |
|---|---|
| **Documents stay markdown** | Beads holds state only. The reasoning a gate agrees — why this order, what this deliberately does not do — is not a field |
| **Always stealth** | one rule, no special case. Cost: work state belongs to the environment, not the clone, and a fresh machine starts empty |
| **CLI, not MCP, for now** | `beads-mcp` is a PyPI package, so adopting it means Python in the image and a second version to pin. Revisit with a measured reason, not a preference |
| **Beads is authoritative for status** | so status comes out of markdown everywhere, closed documents included. A status is state; the `Outcome` sections keep the verdict |
| **`bd ready` informs, never authorises** | the gates stay. They are where this project has found most of its design errors |
| **Opt-in by marker** | no marker, no database and no extra grant in the sandbox. This widens what the agent can reach |
| **Export, not sync** | `bd export` writes JSONL on demand. Nothing reads it back, because something that read it back would be a second owner of the state |
| **Debts become items** | the six-fetches debt stayed open four days because it depended on somebody re-reading a document. In `bd ready` it is visible |

## Stories

| # | Story | Status |
|---|---|---|
| 1 | [the image carries `bd`](the-image-carries-bd/) | Scenarios written, at its gate |
| 2 | the open work becomes a tree | Not started |
| 3 | the status leaves the markdown | Not started |
| 4 | the agent works from the tracker | Not started |
| 5 | the panel asks for Beads | Not started |

**This table is the last one of its kind in this repository.** Story 3 removes status from markdown
and story 1 is what makes a tracker exist to hold it instead — so by the time story 3 lands, these
cells are an item in `bd` and this table is a list of names and IDs. It is written this way now
because nothing else exists yet to write it in, which is itself the argument for the epic.

## What this epic must not do

- **Write to the other tracker.** An item from Azure DevOps is read, referenced and never modified.
- **Put the design in the tracker.** `--design` and `--acceptance` carry a path, not a copy.
- **Let a tracker open a gate.** `bd ready` is a question answered, not a permission granted.
- **Commit the database.** Stealth is unconditional; the engine's files never enter a repository.

## Outcome

Open. Grilled, not started.
