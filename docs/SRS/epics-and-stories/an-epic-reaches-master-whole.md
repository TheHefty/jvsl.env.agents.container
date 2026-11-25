# Epic: an epic reaches master whole

**An epic reaches master whole.**

Proposed on 2026-11-25, from #391. A project plans its work as epics and stories and delivers it
scattered: every story merges straight into `master`, so a release carries whatever landed since the
last one. kotodori's 0.91.0 was about to ship half of the epic `prepared-sentences` — a preparation
batch could be started and not yet followed. The rules this repository ships forbade fixing it in a
project ("The epic does not hold a release … not a merge gate"), so the change starts here.

**Decided by João Lima before any story** (the issue, and the grilling of 2026-11-25):

- **Three levels of branch.** A task's branch is cut from its story's `story/<epic>/<story>`, a
  story's from its epic's `epic/<epic>`, the epic's from `master`. Each level reaches the next by a
  pull request. The prefixes are separate because git cannot hold a branch and a branch nested under
  its name. **A task squashes into its story, and a story squashes into its epic** with its own
  conventional title, so the epic holds one `feat` or `fix` commit per story.
- **A task closes when its pull request merges into its story's branch**, through the review as
  today. A story's branch merges into its epic's when its tasks are accepted.
- **The epic merges into `master` once, when every task under it is accepted** — live verification
  stays after the release, as today. **A merge, not a squash**, so each story's commit reaches
  release-please; **with an empty body and a title that is not conventional**, because release-please
  reads the merge commit's body and would count the work twice.
- **A fix does not wait for an epic.** A debt's or a hotfix's branch goes straight to `master`; open
  epic branches take `master` in.
- **The rule says what the branches need; the developer configures it.** `epic/*` and `story/*` get
  what `master` has — a pull request required, no force-push, no deletion, CI required. The extension sets no
  protection in any project today and does not start here.
- **This repository works this way too**, from its next epic. An epic already half-merged when the
  rule lands finishes under the old flow.
- **Rejected in the issue:** a `develop` branch between epics and `master` (a third long-lived level
  that `master` already plays), and cutting a release only when an epic closes (`master` still holds
  half an epic, and a fix in the meantime ships it).

Threat model: amended in docs/SRS/security.md, in the pull request that agrees this epic — the protected branches the T4
control names (`docs/SRS/security.md`) become `master`, `epic/*` and `story/*`, because a merge into
an unprotected epic or story branch is now a path into `master`.

| # | Story | Why in that order |
|---|---|---|
| 1 | the rules make the epic the merge gate for master | every other story implements what it says |
| 2 | the ceremonies work on the epic's branches | needs the rule; the planning, review and refine name and use the branches |
| 3 | an epic is merged into master once, counted once | needs the branches to exist; the one merge with its own mechanics |
| 4 | this repository's CI runs on epic and story branches | needs the rule; what makes a merge into `epic/*` gated here as into `master` |

## Story 1: the rules make the epic the merge gate for master

`RULES.md` and `WORKFLOW.md`, both languages: "The epic does not hold a release" is replaced by the
branch shape above, the merge into `master` and its empty body, the fix that goes straight to
`master`, the protection the developer configures, and the half-merged epic that finishes under the
old flow. Threat model: amended in docs/SRS/security.md (T4), in the same pull request as this epic.

```gherkin
Scenario: a story's work reaches master only with its epic
  Given an agreed epic with two stories
  When the first story's tasks are accepted and merged
  Then its work is on the epic's branch and not on master

Scenario: a fix does not wait for an epic
  Given an open epic branch
  When a debt's fix is merged
  Then it goes to master directly
  And the rules say the open epic branches take master in

Scenario: the rules name what the developer configures
  Given a project adopting the rule
  When the developer reads the rules
  Then they say epic and story branches need what master has: a pull request, CI, no force-push, no deletion
```

## Story 2: the ceremonies work on the epic's branches

The planning names the branch a claimed task is cut from, and creates the story's and the epic's
branches when they do not exist yet. The review closes a task whose pull request merged into its
story's branch. When a story's tasks are all accepted, the review says its branch is ready to merge
into the epic's. Threat model: unchanged — the ceremonies read and name branches; they push only on
the developer's word, as today.

```gherkin
Scenario: a claimed task is cut from its story's branch
  Given an agreed task under a story under an epic
  When the planning claims it
  Then it names the branch to work on, cut from story/<epic>/<story>
  And it creates the story's and the epic's branches first when they are missing, on the developer's word

Scenario: a task closes on its merge into the story
  Given an accepted task whose pull request merged into its story's branch
  When the review settles
  Then the task is closed

Scenario: a finished story is offered to its epic
  Given a story whose tasks are all accepted
  When the review runs
  Then it says the story's branch is ready to merge into the epic's
```

## Story 3: an epic is merged into master once, counted once

A script merges an epic's branch into `master` when every task under it is accepted, with a merge
commit whose title is not conventional and whose body is empty, and refuses otherwise, naming what
is not accepted. Threat model: unchanged — it merges through the pull request the protection
requires, on the developer's word.

```gherkin
Scenario: a whole epic is merged once
  Given an epic whose tasks are all accepted
  When the developer asks for it to be merged
  Then its branch is merged into master as a merge commit with an empty body
  And each story appears once in the next release's changelog

Scenario: half an epic is refused
  Given an epic with a task not yet accepted
  When the merge is asked for
  Then it is refused, naming the task
  And nothing is merged
```

## Story 4: this repository's CI runs on epic and story branches

`.github/workflows/ci.yml` runs on pull requests into `epic/**` and `story/**` as into `master`, and
the scope that lets a Markdown-only change skip the image half compares against the pull request's
own base. The protection on `epic/*` and `story/*` is configured by the developer, as the rule says.
Threat model: amended in docs/SRS/security.md (T4), in the same pull request as this epic.

```gherkin
Scenario: a pull request into an epic branch is checked as one into master
  Given a pull request into epic/<slug>
  When it is opened
  Then the same jobs run as for a pull request into master

Scenario: the scope is read against the pull request's base
  Given a Markdown-only pull request into a story branch
  When CI decides its scope
  Then it is docs-only, compared against that branch and not master
```
