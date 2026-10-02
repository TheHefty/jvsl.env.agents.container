---
status: Done
story: the-extension-carries-the-image/the-image-builds-here
epic: the-extension-carries-the-image
pr: 43
---

# Task: nothing-was-dropped

## Summary

A guard that fails while any tracked `*.test.sh` has nothing running it. **It is red now, for 25 of
28 files**, and the task that brings the pipeline is what turns it green.

## Problem

The story's risk is a silently dropped job: a job that is gone does not fail, it reports nothing,
and a guard reporting nothing is indistinguishable from one that passes. Task 1 brought 25 test
files and no jobs, so the repository is in precisely that state right now and nothing says so.

Measured on `master` after #41:

| | |
|---|---|
| tracked `*.test.sh` | 28 |
| with something running them | **3** — the three task 1 added, with the job it added for them |
| with nothing running them | **25** |

## Two things this task changes about the story, discovered by measuring

**It moves ahead of the pipeline task, which the story's own prose already said.** The table ordered
the guard third; the prose beside it says *"written before the jobs are moved, it is red for
twenty-nine files and goes green as they arrive — which makes the move's own completeness the thing
that turns the test green"*. The prose is right. A guard written after the jobs is green on its
first run and has never once been seen failing for the reason it exists, which is the thing this
project's rules call proving nothing.

**And the story's task 4 collapses into task 3.** "The fast path" was listed separately, and it
cannot be: this repository's `ci-green` is

```sh
for r in $results; do [ "$r" = "success" ] || exit 1; done
```

so a skipped job **fails it**. The moment image jobs are gated on what changed, every
documentation-only pull request goes red. Gating, `scripts/ci-green.sh` and the jobs are one change
or none, and pretending otherwise would ship a repository where a Markdown fix cannot merge.

## Proposal

`scripts/every-test-has-a-runner.test.sh`. For each tracked `*.test.sh`, something in the workflow
must run it.

**Matching is pattern-based, not literal, and that is the whole difficulty.** A literal search
reports three false absences — `stacks/{cpp,php,python}/image.test.sh`, which are reached as
`stacks/${{ matrix.stack }}/image.test.sh` and do run. So every `run:` step's paths are collected
and each `${{ … }}` becomes a `*`:

```
stacks/${{ matrix.stack }}/image.test.sh   →   stacks/*/image.test.sh
```

**That glob trusts something it does not itself check**: that the matrix covers every directory the
glob matches. It is true because `discover-stacks` reads the stack list from the tree, which is the
story's first scenario and is asserted separately. Written down because two assertions leaning on
each other is fine and two assertions each assuming the other is not — and the difference is
whether somebody said so.

## Three worst failure scenarios

**1. It passes vacuously.** The file list comes from `git ls-files`, and a guard that loops over
nothing passes while proving nothing. If the workflow moves, cannot be read, or the glob stops
matching, this reports success on an empty set — and it is the guard everything else is trusting.
The template's own guards already carry the answer to this: a floor, asserted before the loop, that
refuses when the list is implausibly short.

**2. The glob claims coverage that does not exist.** `${{ … }}` → `*` is deliberately permissive.
A file matching `stacks/*/image.test.sh` in a directory no matrix entry reaches would be reported
as covered. This is the cost of not producing false absences, and it is the right trade only while
the matrix is derived from the tree.

**3. The guard is an orphan itself.** A check that nothing runs is the joke this task would be
telling: it must find a runner for itself, and the assertion costs one line because it is already
iterating over every test file including its own.

## Verification

| Test | Asserts |
|---|---|
| `scripts/every-test-has-a-runner.test.sh` | is the deliverable, and is itself tested below |
| `scripts/every-test-has-a-runner.test.test.sh` | the floor refuses an empty or short list; a matrix-interpolated path counts as a runner; a literal path counts; a file with neither fails; and the guard appears in its own output |

**The guard needs its own test and that is not ceremony.** Its failure mode is passing when it
should fail, which no amount of running it in CI reveals. The template has the same shape in
`scripts/changed-scope.test.sh` and `scripts/ci-green.test.sh` — the scripts that decide whether
other checks run are the ones whose own correctness nothing else covers.

Red first is already true for the deliverable: 25 of 28. For its own test, the fixtures are written
before the guard exists.

## Blast radius

The guard is added and will fail. **That is intended and it is the point of ordering it here** —
but it means `master` carries a red check between this task and the next. Named rather than
discovered: the alternative is a guard that has never been seen red, and the window is one task.

## Alternatives considered

- **A literal grep.** Measured: three false absences out of twenty-nine, all of them real
  coverage. A check that cries wolf is one somebody stops reading, which is worse than not having
  it.
- **Listing the expected jobs by hand and comparing.** Rejected: it is the same hand-maintained
  list the story is about, one level up, and it would be the thing that silently stops matching.
- **Asserting a job count.** Rejected: a count matches when one job is deleted and another added.
- **Writing the guard after the jobs.** Rejected above — it is green on its first run and has never
  failed for its own reason.

## Open questions

**One, and it is the next task's to answer rather than this one's.** Both repositories define a job
named `ci-green` and this repository's branch protection requires that name. Recommended: **one
workflow file**, the template's jobs joining this one's and a single `ci-green` needing them all.
Two files each defining the name leaves the required check matching by name across workflows, which
is ambiguous in exactly the way a required check must not be — and the alternative, renaming the
second, needs somebody to add a required check in the repository's settings. A required check
nobody remembered to add is a check that does not gate.

## Outcome

Implemented in #43. The guard is red at **25 of 30** — the number this design measured — and its own
test is green at 6 of 6.

**Its own test was red in a way worth recording.** With the guard absent, **four of the six checks
passed for the wrong reason**: a refusal and a missing file both exit non-zero, so every
"expect a refusal" case was satisfied by the guard not existing. The harness now asserts the guard
is present and executable before running anything, and requires a refusal to be a refusal *in
words* — a crash produces no output and no longer counts. That was the first run of the file telling
me my own harness was the thing being tested.

**The self-check fired for a cause the message did not name.** `scripts/every-test-has-a-runner.test.sh`
was reported as missing from the list of tests to account for, and the reason was not exemption —
the file was simply not committed yet, because the list comes from `git ls-files` rather than from
the working tree. Correct behaviour, incomplete message; the message now names both causes.

**Two jobs, deliberately different in weight.** `guard-is-sound` runs the fixtures and gates.
`nothing-was-dropped` runs the guard and is **not** in `ci-green`'s needs, so `master` carries a
visibly failing check that does not block — which is what the design said it would, and the next
task adds it to `needs` in the same change that makes it green.

**The glob's permissiveness is now observable rather than argued.** With two jobs added, the
extraction reports 5 runner patterns and the orphan count fell from 27 to 25 — the guard and its
own test finding their runners. The matrix case is covered by a fixture rather than by the live
workflow, which is why it is a claim the test can make before the stack jobs exist.
