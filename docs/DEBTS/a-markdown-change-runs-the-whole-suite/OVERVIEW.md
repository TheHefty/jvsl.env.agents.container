# Debt: a Markdown change runs the whole suite

| | |
|---|---|
| **Status** | **Paid** — found and fixed on 2026-10-05 |
| **Found** | 2026-10-05, by the operator, while three runs died waiting for runners |
| **Kind** | A defect found outside the chain and fixed in the change that recorded it |

## Problem

**27 of 36 checks run for a change that touches only Markdown.**

`CLAUDE.md` says a Markdown-only change "skips the image half and finishes in under a minute". The
first half is true. The second is not: the image half is four jobs, and **the other eighteen run
regardless** — `typecheck`, `unit`, `package`, `integration`, the bundle, every shell test under
`core/`, `jail-wrappers`, `compose-versions`, `git-credential-helper`.

None of them can be affected by a `.md` file.

**How it surfaced is the part worth keeping.** It did not surface as slowness. On 2026-10-05 three
consecutive runs were cancelled after fifteen minutes with no job ever getting a runner, and the
pull request that could not get through was **documentation only** — twenty-one jobs queued for a
change that needed five. The waste was invisible while runners were free.

## Root cause

**The mechanism exists and almost nothing uses it.** `scripts/changed-scope.sh` is correct: it
prints `docs-only` only when every changed path is `docs/**` or a root-level `.md`, and it is
conservative in the right direction — an undetermined scope is `full`.

But of the twenty-seven jobs declared in `ci.yml`, **four consult it**: `core-build`, `core-booted`,
`discover-stacks` and `stack-build`. Those are the jobs that existed *after* the scope decision was
introduced, or that it was introduced for. Everything older kept running unconditionally, and nothing
said so.

**A guard that is applied where somebody remembered is not a guard.** This is the same shape as the
command names that a rename left behind, found the same day: a mechanism that is right, applied in
some places, and silent about the places it is not.

## Fix

**Every job consults the scope except five, and the five are written out with their reasons.**

| job | why it runs for a Markdown change |
|---|---|
| `changes` | it is what computes the scope |
| `md-size` | the rule that a Markdown file stays under 50 KiB is about Markdown files |
| `agent-docs` | the two language folders are checked against each other, and a rule corrected in one and not the other is a documentation defect |
| `ci-scripts` | it carries `agent-docs-cite-real-files.test.sh`, which fails when a normative document cites a path that does not exist |
| `ci-green` | the gate itself, which must report on whatever ran |

The remaining eighteen gain `if: needs.changes.outputs.scope != 'docs-only'`.

**`ci-scripts` runs nine guards and only one of them is about documentation.** Splitting it would run
fewer *scripts* and the same number of *jobs* — and the cost that matters here is a job, because a job
is a runner. It is left whole deliberately.

## Regression scenario

**`scripts/every-job-respects-the-scope.test.sh`.** It reads `ci.yml`, and fails when a job neither
consults `needs.changes.outputs.scope` nor appears in a written list of jobs that must run anyway.

**An allowlist rather than a count**, for the reason this repository gives every time it chooses one:
a count passes while the wrong job is on the wrong side of it, and the next job added inherits
whatever the author assumed. A name on a list is a decision somebody made; a number is not.

Observed failing against `ci.yml` before the fix, naming all eighteen.

**And it gained a second check, from a mistake made inside this very fix.** Adding `if:` to a job
that already had one — `declared-extensions`, which runs only when an extension identifier changed —
produced a duplicate key. GitHub rejected the whole workflow with *"This run likely failed because of
a workflow file issue"* and **no jobs at all**: nothing to read, nothing to diagnose, and the first
version of this guard passed because the string it looked for was present *twice* rather than once.

So the guard now also fails when any job declares the same key twice. Proved by injecting a duplicate
`needs:` into another job and watching it be named.

**Two keys were checked before the push and the wrong two.** Duplicate `needs:` was checked, because
that is what the edit inserted; duplicate `if:` was not, because nothing had suggested a job might
already have one. The lesson is not "check `if:` too" — it is that a text edit to a structured file
needs the file parsed afterwards. `js-yaml` was in `node_modules` the whole time.

## Payback

Paid in the change that recorded it. The trigger that said it could no longer be deferred was not
cost — it was that a documentation pull request could not get through CI at all, and twenty-one of
its twenty-seven checks had no business being there.

## Outcome

**Closed on 2026-10-05, the day it was found.** What it leaves behind is the guard: the scope
decision is now enforced rather than remembered.
