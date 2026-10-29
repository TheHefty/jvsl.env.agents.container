# release-please reads merge commit bodies

## The problem

This repository's 1.8.0 changelog listed every change twice, and its 1.6.4 changelog already had duplicates (`CHANGELOG.md:52-53` on `master`). Nothing failed and no tool warned: the releases were cut and published looking like twice as much work had shipped.

## Fundamentals

**release-please** builds a release from the commits on the default branch: it reads each commit message, keeps the ones written as [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, …), and turns them into changelog entries and a version bump. This repository runs it through `googleapis/release-please-action@v4` (`.github/workflows/release-please.yml:43`), with `release-type: node` (`release-please-config.json:3`).

A commit message has a **subject** (its first line) and a **body** (everything after the first blank line). Conventional Commits defines the type in the subject. release-please goes further: it supports **several changes in one commit**, written as further conventional headers at the bottom of the message. Its README calls this "What if my PR contains multiple fixes or features?". In its source, `splitMessages` in `src/commit.ts` cuts a message into parts wherever a blank line is followed by something that looks like a conventional header, and each part is parsed on its own (`parseConventionalCommits`, same file).

A part that does not parse as a conventional commit is not an error: it is dropped, with a `logger.debug` line nobody sees in a release workflow.

When GitHub merges a pull request with **"Create a merge commit"**, it writes a merge commit whose subject is `Merge pull request #<n> from <owner>/<branch>` and whose body is, by default, the pull request's title. In this repository, `git log -1 --format=%B 92e9e8e` shows one exactly so: `#239`, with the body `feat: the daily`.

## What goes wrong without it

Put the three facts together for a pull request titled `feat: x`, whose branch carries a commit `feat: x`, merged with a merge commit. Before reading on, work out what release-please parses from each of the two commits: the branch's own, and the merge commit GitHub writes over it. Being able to say it without looking is the point of studying this.

The result is not a broken build or a wrong version: the bump is the same either way. It is a changelog that misrepresents the release, on every release, until somebody reads one closely. Here that was after 1.8.0, ten entries in. A first diagnosis that blamed the merge commit's *subject* was wrong, and a release went out while it stood.

## How the project solves it

- **1.8.0**: the duplicates were dropped from the release pull request's `CHANGELOG.md` before it was merged, keeping for each change the line whose commit is not a merge commit. A merge commit is one `git rev-list --parents -n1 <sha>` shows with more than one parent. The commit is `chore: one changelog entry per change in 1.8.0`. The GitHub release's notes were then replaced with the same section, because release-please writes them from its own reading, not from the file.
- **From 1.8.0 on**, pull requests were merged with an empty merge body: `gh pr merge <n> --merge --subject "Merge pull request #<n> from …" --body ""`. The 1.9.0 changelog came out with one entry per change (`CHANGELOG.md`, section `1.9.0` on `master`).
- **Not solved yet**: that way of merging is written in the agent's memory, not in this repository. `docs/agent/en/RULES.md`, *Commits and releases*, says nothing about merge commit bodies.

## Trade-offs

- **Recorded decisions**: none about the merge strategy. The repository's history uses merge commits throughout (`git log --merges origin/master`), and `docs/agent/en/RULES.md` (*Branches and review*) requires a pull request for every change, without choosing how it is merged.
- **Implicit decisions**: merge commits rather than squash merges. release-please's README recommends squash merges for a linear history ("Linear git commit history (use squash-merge)"); the repository never chose against it in writing.
- **What the agent discovered**: the mechanism above, by reading `src/commit.ts` at `googleapis/release-please` (last changed 2026-10-22, `c589293`); and that the GitHub release notes are written independently of `CHANGELOG.md`. How GitHub fills a squash merge's body, and whether that body would also be split, is not confirmed here **(inference)**. Check GitHub's documentation on merge methods and the repository's *Pull Requests* settings.

## Sources

- release-please, README: "What if my PR contains multiple fixes or features?" and "Linear git commit history (use squash-merge)" — https://github.com/googleapis/release-please#readme
- release-please, `src/commit.ts`: `splitMessages`, `parseConventionalCommits`, `preprocessCommitMessage` — https://github.com/googleapis/release-please/blob/main/src/commit.ts
- Conventional Commits 1.0.0 — https://www.conventionalcommits.org/en/v1.0.0/
- GitHub Docs, "About merge methods on GitHub", and the repository's merge commit message setting.

## Points for the post

- **Central idea**: a tool's convenience feature, combined with a platform's default, can quietly double what you publish, and every tool in the chain is working as designed.
- Three to five points: what a merge commit's message holds; release-please's multi-change feature and how it splits; why the subject was the wrong suspect; how to see it (merge commits' shas in the changelog); the fixes and their costs.
- **To confirm before writing**: the squash-merge behaviour marked as an inference above; whether release-please's `BEGIN_COMMIT_OVERRIDE` in a pull request body changes the picture for merge commits.
- **To fix before publishing**: put the merge-body rule in this repository's *Commits and releases*, so the post does not describe a fix that lives only in one agent's memory.
