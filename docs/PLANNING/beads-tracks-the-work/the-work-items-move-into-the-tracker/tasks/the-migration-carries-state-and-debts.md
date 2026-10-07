# Task: the migration carries state and debts

| | |
|---|---|
| **Story** | `the-work-items-move-into-the-tracker` |
| **Date** | 2026-10-07 |
| **Depends on** | `the-migration-carries-the-prose` (shipped as `scripts/migrate-planning.sh`) |

## Summary

`scripts/migrate-planning.sh` closes what is finished, carries the debts with their kind, and gains a
`--plan` mode that shows every document's computed state before anything is written. Scenarios 1
("closed work included, marked as finished") and 9 ("debts move with their kind"). FR-117 and FR-120.

## Problem

The script creates every item open and does not read `docs/DEBTS/` at all. Run today, about forty
finished tasks would sit in `bd ready` as available work, and the board would show the whole history
under Open. An agent following the rules would report finished work as the next thing to do.

## Proposal

**State, read from the parent's table.** Agreed by the operator on 2026-10-07. Each epic README lists
its stories, and each story OVERVIEW lists its tasks, in a table with a `Status` column. Measured
across the repository: three header shapes (`# | Story | Status`, `Order | Task | Status`,
`Order | Task | Repo | Status`), so the column is found by its header rather than its position. A row
is matched to its document by the link in its second column.

| Status cell | Item |
|---|---|
| starts with `Done` or `Shipped`, with or without bold | closed, with the cell's text as the reason: `bd close <id> --reason "Done — #25"` |
| anything else, or no row at all | left open, and **listed** |

**An epic is closed when every one of its stories is.** It has no parent table to read.

**Debts, from `docs/DEBTS/<slug>/OVERVIEW.md`.** Each becomes a `bug`, with the whole file as its
body and one kind label from a map written in the script, by hand, as approved on 2026-10-06. Two
debts recorded since then are added to it here:

| Debt | Label | State |
|---|---|---|
| `a-markdown-change-runs-the-whole-suite` | `defect` | closed |
| `agent-state-directory-is-lost-under-the-mount` | `defect` | closed |
| `forwarded-secrets-land-in-the-sandbox-argv` | `hotfix` | open |
| `six-build-time-fetches-verify-nothing` | `defect` | open |
| `the-sandbox-under-apparmor` | `defect` | open |
| `the-panel-reads-the-containers-path` | `defect` | open |
| `bd-reports-usage-by-default` | `defect` | closed |
| `the-size-check-test-races-git` | `defect` | open |

A debt's state comes from its own `Status` row: `Paid` is closed, anything else is open. **A debt
missing from the map stops the run before anything is created.**

**`--plan`** prints every document, the kind of item it becomes, and its state with the reason, and
writes nothing. The operator reads it, and in particular the open-and-listed section, before the real
run. The real run prints the same plan first.

## Three worst failure scenarios

| # | Scenario | How it manifests | Test that catches it |
|---|---|---|---|
| 1 | **Finished work arrives as open work.** A header shape is missed, or a status with bold or a PR number is not recognised | `bd ready` lists done tasks; the board's Open column holds the project's history | `migrate-planning.test.sh` with fixtures of all three header shapes, and with `**Shipped**`, `Done — #25` and `Shipped in #123`: each arrives closed, with the cell as its reason |
| 2 | **A debt is left behind, or carries the wrong kind.** A debt recorded after the map was written | the debt's file is deleted with nothing in the tracker, or a hotfix shows as a defect | a fixture with a debt absent from the map: the run exits before creating anything, naming it. A fixture with every mapped debt: each arrives with its label and state |
| 3 | **An unrecognised status is decided silently.** A stale "Draft" is closed by a looser rule, or left open with nobody told | finished work hidden from the board, or unfinished work hidden from `bd ready` | `--plan` on a fixture with "Draft" and "Designed, at its gate": both are open, both are listed under their own heading, and `--plan` writes nothing |

## Blast radius

`scripts/migrate-planning.sh` and its test. Nothing runs it but the operator. It ships in no image
and no package.

## Alternatives considered

- **Inferring state from git history** (a task's PR merged). More precise, but it reads GitHub,
  which the script has no business reaching, and the tables already say it.
- **Fixing the stale statuses first, and failing on anything unrecognised.** Stricter. Declined for
  the listing the operator agreed, which surfaces them without blocking.

## Verification

`migrate-planning.test.sh` in `ci-scripts`, against the bd stand-in. The real run is the operator's,
after reading `--plan`.

## Open questions

None.

## Outcome

Filled in when the task closes.
