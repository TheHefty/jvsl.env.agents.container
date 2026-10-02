---
status: Draft
story: the-extension-carries-the-image/the-image-builds-here
epic: the-extension-carries-the-image
pr:
---

# Task: the-pipeline-arrives-builds-and-stays-fast

## Summary

The jobs arrive, the images build, and a Markdown change still finishes in under a minute. This is
the task that turns `nothing-was-dropped` green and puts it in `ci-green`'s needs.

## What the 25 orphans actually need, measured by running them

Each of the 25 was run in this repository before this was written. **16 pass already** — they are
pure shell over files that are here, and they need only a job. The other 9 split into four kinds,
and the kinds have different answers.

| | what it needs |
|---|---|
| **16** — `jail-wrappers`, `compose-dockerfile`, the four `cont-init`, `check-devcontainer-metadata`, `changed-scope`, `check-md-size`, `declares-extensions`, `declared-extensions`, `no-ubuntu-only-sources`, `php/keyring`, `booted.matchers`, `svc-ai-memory/run`, `jail-env-allowlist` | a job, nothing more |
| **5** — `core/image`, `core/booted`, `stacks/{cpp,php,python}/image` | a built image. They fail here with `no such image: core-ci` and `can't read /image-test/versions.json`, which is them correctly refusing to assert about an image that does not exist |
| **1** — `scripts/ci-green.test.sh` | nothing. It fails on a floor: *"parsed only 8 jobs out of ci.yml; the shape this test reads has changed"*. The template's workflow has 22. **It passes by itself once the jobs arrive** |
| **1** — `scripts/no-launcher.test.sh` | this repository's submodule bumped — see below |
| **2** — `scripts/no-whiptail.test.sh`, `scripts/agent-docs-cite-real-files.test.sh` | their subjects, which have not arrived — see below |

## The submodule finding, which is not about CI

`no-launcher.test.sh` fails here, and the hits are all inside `.code-server/`:

```
.code-server/.gitignore:8:start/target/
.code-server/README.md:71:   .code-server/start/target/release/start
.code-server/dev:20:BINARY="$CRATE/target/release/start"
```

**This repository's submodule is pinned at `v2.2.0`** — three majors behind — so it still contains
the launcher that `v3.0.0` deleted. The guard is right and the repository is wrong.

**And `CLAUDE.md:32` imports `MODES.md` from that submodule**, which means the normative documents
this project has been worked under are three majors old. Diffed across the gap: one real rule was
added and has not been in force here.

> Hand it over as a file, never as a variable. A variable passed into the sandbox is re-expanded
> onto the sandbox launcher's own command line, and that launcher runs in the container's process
> namespace — so the value is readable with `ps` from anywhere else in the container.

In practice the rule was followed, because it is also a standing instruction from the user. Formally
nothing said it was in force, which is the exact failure the rules describe: *"a bump is the moment
they move"*. **Bumping to `v5.0.0` is part of this task** — it is what lets `no-launcher.test.sh`
pass, and it is not optional for a reason that has nothing to do with the guard.

The submodule itself goes away in story 5, when `docs/agent/` arrives here and FR-82 is satisfied.
Bumping it now rather than removing it now is the smaller change, and the removal happens when its
replacement exists.

## The two that are deferred, and why that is not an exemption

`no-whiptail.test.sh` refuses because the files it reads are not here:

```
NOT OK  these files are not where this check expects them: setup init packages.sh packages…
```

Those live at the template's root. They did not come, deliberately — task 1 brought `core/`,
`stacks/` and `scripts/` and nothing else. `agent-docs-cite-real-files.test.sh` is the same shape:
it extracted **0 script citations** because `docs/agent/` is not here either.

**Both are guards whose subject has not arrived, and both are deferred rather than exempted.** They
are removed from this repository in this task and return with their subjects — `docs/agent/` in
story 5, and the `setup` files in the epic's story 3. An exemption list inside the guard would be
the thing that rots; a file that is not here cannot be forgotten about, because the story that
brings its subject brings it back.

**This does not disturb task 1's assertion.** `the-trees-match-the-template.test.sh` compares the
three tree hashes **at the merge commit**, not at `HEAD`, so removing files afterwards leaves it
true. That was not foresight; it is worth noting that pinning the assertion to the commit is what
makes the tree editable at all.

## The `ci-green` collision, answered

**One workflow file.** The template's jobs join this one's and a single `ci-green` needs them all.

Two files each defining a job of that name leaves branch protection matching a required check by
name across workflows, which is ambiguous in the way a required check must not be. Renaming the
second needs somebody to add a required check in the repository's settings, and a required check
nobody remembered to add is a check that does not gate. One file needs no settings change at all:
`ci-green` is already required and already named.

**`scripts/ci-green.sh` replaces the inline loop**, and that is not tidiness. The current one is

```sh
for r in $results; do [ "$r" = "success" ] || exit 1; done
```

which **fails on `skipped`** — so the moment a job is gated on what changed, every
documentation-only pull request goes red. The template's script exists because that was already
learned once.

## Three worst failure scenarios

**1. A job arrives that reports nothing.** A job whose `run:` step silently succeeds — a mistyped
path under `continue-on-error`, a test invoked with an argument it ignores, a `for` loop over an
empty list — passes and proves nothing. `nothing-was-dropped` catches a *missing* job and cannot
catch a *hollow* one. The answer is not another guard: it is that each job's name states what it
asserts, and that the first run of this task's pipeline is read job by job for the assertion
counts, as the template's own runs have been.

**2. The gating hides a real failure.** `changed-scope.sh` decides which jobs run. A bug there that
is too eager to skip turns the whole pipeline into a green light: image jobs skipped, `ci-green`
accepting `skipped`, and nothing built. This is the single most dangerous file in the change, which
is why `scripts/changed-scope.test.sh` is among the 16 that already pass and gets a job in the same
commit as the thing it guards.

**3. `ci-green` accepts something it should not.** Moving from "every result must be `success`" to
"`skipped` is acceptable" widens what passes, and the widening is where a cancelled or failed job
could slip through as skipped. `scripts/ci-green.test.sh` already covers this — it has 11 passing
assertions including a cancelled job, an invented result, and the empty string — and its floor
failure is the thing this task fixes.

## Verification

The deliverable is that `nothing-was-dropped` goes green and joins `ci-green`'s needs. Beyond that:

| | |
|---|---|
| `scripts/ci-green.test.sh` | passes once the workflow has more than 8 jobs — its own floor |
| `scripts/changed-scope.test.sh` | passes already; gets a job in the same commit as the gating it guards |
| the first full run | read job by job, by name, for the assertion counts — not trusted as a green tick |
| a documentation-only pull request | observed skipping the image jobs and still reporting success |

## Blast radius

Large and deliberate. This repository's pipeline goes from 5 jobs to roughly 22, and from under a
minute to **6 minutes** on a change that touches the image — measured on the template's run
`37030096331`, not estimated. A Markdown change stays under a minute, which is the whole purpose of
bringing the gating in the same change rather than after.

## Open questions

None. The two that this task's measurement raised — the submodule pin and the two deferred guards —
are answered above rather than left.

## Outcome

Filled in when the status leaves `Draft`.
