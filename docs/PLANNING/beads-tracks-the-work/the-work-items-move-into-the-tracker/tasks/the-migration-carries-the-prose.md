# Task: the migration carries the prose

| | |
|---|---|
| **Story** | `the-work-items-move-into-the-tracker` |
| **Date** | 2026-10-06 |

## Summary

A script reads the planning tree, creates one tracker item per epic, story and task with the
document's **whole body** as its description, puts a story's `.feature` in its acceptance field, and
deletes the files — **after** reading each item back and comparing it to what was deleted. FR-117,
FR-120.

## Problem

Fifty-nine files and 285 KB have to end up in a tracker without losing what they are for, and the
documents are then removed. Getting it wrong in the quiet direction — structure carried, prose
dropped — leaves fifty-nine green rows and a project whose reasoning is in `git log`.

## Why the whole body goes into one field

**Measured rather than assumed.** Across the fourteen story documents there are **43 distinct section
headings, and 34 of them appear exactly once** — 79%. The tasks are the same shape: 47 distinct, 36
unique.

| | |
|---|---|
| the skeleton | `Summary`, `Out of scope`, `Acceptance criteria`, `Tasks`, `Outcome` — in every document |
| the tail | *"Why it is first"*, *"Why it is last"*, *"Why not the obvious mechanism"*, *"The one thing this story can get silently wrong"* — one document each |

**The skeleton is the form and the tail is the argument.** A field-by-field migration would carry the
first perfectly and the second badly, and report success for both. So the body goes into
`description` as Markdown, unaltered, and `--acceptance` takes the `.feature`. The tracker's other
fields stay empty.

**What that costs, plainly:** asking "what does this story refuse to do" becomes a text search rather
than a query. Accepted, because the alternative loses 79% of the structure to gain a query nobody has
asked for yet.

## Three worst failure scenarios

**1. An item is created with an empty or truncated body, and the file is deleted anyway.** The worst
of the three, because both halves report success: `bd create` exits 0 and `rm` exits 0, and what is
gone is the only copy anybody reads. A field limit, an encoding refusal, or a shell that ate a
heredoc all land here.

*Covered by:* reading every item back out of the tracker and comparing it **byte for byte** against
the file, and deleting nothing until every comparison has passed. The same order the manifest rename
used — write, read back, compare, and only then unlink — and the reason is identical.

**2. The deletion runs against a tree the creation did not see.** A file added between the two passes
is deleted without ever being migrated; a file renamed is migrated twice.

*Covered by:* one list, built once, used by both passes. The deletion walks the list it migrated
rather than the directory.

**3. The hierarchy is lost while every item exists.** Fifty-nine items, each correct, in a flat list —
and nothing fails. The structure the directories carried for free is the thing a reader uses to
navigate, and it is invisible in any per-item check.

*Covered by:* asserting the counts of what hangs off what — five epics with their stories, fourteen
stories with their tasks — rather than that each item has a parent. A parent that points at the wrong
thing passes the second check and fails the first.

## Blast radius

- **59 files deleted**, including the fourteen `.feature` files.
- **`docs/agent/en/RULES.md` and `docs/agent/pt-BR/RULES.md`** amended: acceptance criteria may live
  beside their story **or** in the tracker when a project has one. That ships to every project that
  bumps, which is why it is both languages and why it adds a place rather than moving one.
- **`docs/RULES.md`** records that this repository uses the second form.
- **`docs/PLANNING/` does not disappear** — the epic READMEs are what the board is built from until
  story 3 exists, and they go in the same pass.

## Alternatives considered

- **Field-by-field mapping.** Rejected on the measurement above: 79% of the structure has nowhere to
  go.
- **Migrate and keep the files.** Rejected by FR-117: two places holding one document is where a
  reader cannot tell which one the work followed.
- **Migrate open work only.** Rejected by FR-120: a board showing the project's recent half is a board
  showing a project that does not exist.

## Verification

- **The byte-for-byte read-back** is the regression test for the first failure scenario, and it
  runs as part of the migration rather than after it.
- **The counts** — five epics, fourteen stories, twenty-five tasks, each under the right parent —
  are asserted against the numbers measured before the run, not against whatever the run produced.
- **The `@manual` pass** the story names: that somebody reading a migrated story can still follow why
  it was ordered as it was. No assertion reaches that.

## Open questions

None. What the body maps to, where the `.feature` goes, and which rules change were settled on
2026-10-06.

## Outcome

Filled in when the task closes.
