---
status: Done
story: the-extension-carries-the-image/the-image-builds-here
epic: the-extension-carries-the-image
pr: 41
---

# Task: the-content-arrives-with-its-history

## Summary

`core/`, `stacks/` and `scripts/` arrive in this repository with the 86 commits that explain them.
No behaviour changes and nothing in the extension reads them yet. The deliverable is that the three
trees are provably identical to what `jvsl.env.agents.code-server` holds at `v5.0.0`, and that
`git log` on any file in them still works.

## Problem

The story needs the content here before the pipeline can build it. The question the story left open
was whether it arrives with its history, and the answer is yes — these files are unusually dense in
*why*, and this project's own rules put why in the commit message rather than the diff.

## Proposal

**A single merge commit with two parents.** Add the other repository as a remote, fetch its tag,
and merge with `--allow-unrelated-histories`, resolving collisions in favour of this repository.

```
git remote add template <url>
git fetch template v5.0.0
git merge --allow-unrelated-histories --no-commit FETCH_HEAD
#   → resolve: keep ours for the 8 colliding top-level paths
#   → take theirs for core/ stacks/ scripts/
git commit
```

**The measurement chose this over the two alternatives, and it chose well.**

| | |
|---|---|
| `core/`, `stacks/`, `scripts/` already in this repository | **0 files each** — nothing to collide with |
| top-level paths present in both | 8: `CHANGELOG.md`, `docs`, `.github`, `.gitignore`, `LICENSE`, `README.md`, and the two release-please files |
| commits that become reachable | **86** of the template's 285 — 59 touching `core/`, 30 `stacks/`, 11 `scripts/` |

`git subtree add`, which the story recommended, puts the files under a prefix — and the prefix is
not needed, because the three names are free. Keeping the paths unchanged means **nothing is
rewritten**: original SHAs, so every commit cited in the template's own `docs/overview/` and
`CHANGELOG.md` still resolves once those arrive, and `git log core/Dockerfile.frag` works with no
`--follow` and no rename detection. `git filter-repo --to-subdirectory-filter` was the other
option and rewrites every SHA, which is the cost of a prefix nobody needs.

**The 8 collisions are all resolved in favour of this repository, and none of them is content this
task brings.** `.github/` is the one to be careful with: both repositories have
`workflows/ci.yml`, and this task adds none of the template's jobs — that is the next task. What
arrives under `.github/` is nothing.

## Three worst failure scenarios

**1. The merge replaces this repository's own files, and the replacement reports green.** An
unrelated-histories merge touches every path. The worst single case is
`.github/workflows/ci.yml`: the template's version would remove `typecheck`, `unit`, `package` and
`integration` — and it **also defines a job named `ci-green`**, which is this repository's one
required check. Branch protection would keep finding a `ci-green`, keep reporting the branch
mergeable, and the extension would have stopped being tested with nothing anywhere saying so.

**2. A file is dropped and nothing exercises it.** A `cont-init` hook, or one stack's
`versions.json`. The image still builds: hooks run at container boot rather than at build time, and
a version file is only read for the version a manifest selects. The gap would survive this task,
the next, and the story — surfacing the first time somebody selects the version nobody tried.

**3. The history arrives and is not reachable from the paths.** The merge commit has two parents,
every file is correct, and `git log core/` shows one commit — because the resolution was done by
*copying* files in rather than by taking their side. **This is the failure that looks like
success**, and it deletes the entire reason this mechanism was chosen over a copy.

## Verification

Three tests, one per scenario, written before the merge and red against its absence.

| Test | Asserts |
|---|---|
| `scripts/merge-touched-nothing-else.test.sh` | the merge commit's diff against its first parent is empty outside `core/`, `stacks/` and `scripts/` — pinned to that commit, so it stays true forever rather than drifting as the extension changes |
| `scripts/trees-match-the-template.test.sh` | `git ls-tree -r` over the three directories has identical paths **and identical blob hashes** to `template/v5.0.0`. Blob hashes, not a file count: a truncated file has the right name |
| `scripts/the-history-is-reachable.test.sh` | a known template commit is an ancestor of `HEAD`, and `git log --oneline -- core/Dockerfile.frag` returns more than one commit |

**The second test is the one that answers scenario 2** and it is why the assertion is on hashes.
A count matches when a file is empty; a path list matches when a file is truncated. Comparing the
blob hashes is comparing the content, and git has already computed them.

**The third test is unusual and worth keeping anyway.** It asserts something about this
repository's own history rather than about its code, and it is the only thing that would notice a
later rebase or squash flattening the merge away. A squash of this commit is exactly the change
that would leave the files right and the reasons gone.

## Blast radius

Everything and nothing. The merge touches the whole tree in principle and is required to change
nothing outside three new directories — which is what test 1 exists to assert rather than to hope.
The extension's own code is untouched: no `src/` file changes, and the 119 unit tests must still
pass unchanged, which is itself a check on scenario 1.

## Alternatives considered

- **Plain copy.** One commit, no merge, no second parent. Rejected by the story.
- **`git subtree add --prefix`.** Rejected above: it buys a prefix the measurement says is not
  needed, and the prefix is what forces either rename detection or a rewrite.
- **`git filter-repo --to-subdirectory-filter` then merge.** Same prefix, and rewrites all 285
  SHAs.
- **Bringing the whole repository rather than three directories.** Rejected: `docs/agent/` belongs
  to story 5, and bringing it now would put the normative documents in two repositories at once —
  which is the divergence this whole arrangement exists to end.

## Open questions

**None for this task.** One for the next, recorded here because it is discovered by this one: both
repositories define a job named `ci-green`, and this repository's branch protection requires that
name. Two workflow files each defining it makes the required check ambiguous, so the pipeline task
has to decide between one merged workflow and a renamed second check.

## Outcome

Implemented in #41. 86 files — `core/` 34, `stacks/` 39, `scripts/` 13 — and 8 assertions across
three new tests, red before the merge and green after. 119 unit tests, 6 bundle, 4 vsix, typecheck
clean.

**A tree hash replaced the verification this design proposed, and is stronger.** The design said
"identical paths **and** identical blob hashes". A git tree hash is content-addressed over the whole
subtree — names, modes and every blob, recursively — so three hash comparisons subsume both, need no
network, and keep working after the other repository is archived. The expected hashes *are* the
content rather than a description of it.

**The merge reached 98 paths outside the three directories** and all of them were resolved back to
ours: 9 restored, 89 removed because they existed only on the template's side. Seven were add/add
conflicts. `docs/agent/` is among the 89 — it belongs to story 5, and bringing it now would put the
normative documents in two repositories at once.

**A fourth failure scenario existed and this design did not name it.** Merging 86 files into the
repository root took the `.vsix` from 6 files to **108** — the whole of `core/` and `stacks/` plus
all thirteen CI guards — and every test passed, because the three assertions beside the packaging
test name what must *not* ship. **A list of exclusions cannot see a directory nobody thought of.**
The fix is an allowlist assertion: everything packaged has to be something the test was told to
expect, so a new directory at the root fails it by existing. Red at 102 unexpected files, green at
6. The scenario belonged in this design and was not there.

**And that new assertion found a leak that predates this task.** `.claude/` and `.agents/` — sixteen
agent skill files — were being packaged. They are never tracked, so a CI package from
`actions/checkout` never saw them and the published `v0.3.0` is clean; what differed was
`npm run package` on a developer's machine. The same class of defect as the earlier fix "packaging
builds what it packages", found by a test written for something else.

**Two untracked files blocked the merge and were strays from another repository.** `SECURITY.md`
naming `jvsl.monorepo.agents.template`, and `version.txt` reading `1.8.0` — the monorepo's version,
where this extension is at `0.3.0`. Preserved outside the repository rather than deleted, and the
merge was resolved so the template's versions of both do not arrive either: a `version.txt` reading
`5.0.0` in a repository versioned `0.3.0` is worse than none.

**The three tests got their CI job in the same change.** Writing three tests about not dropping CI
jobs and leaving them with no job would have been the joke answering itself. `fetch-depth: 0` is
load-bearing — all three walk history and a shallow clone has none, so they would fail for the
wrong reason.
