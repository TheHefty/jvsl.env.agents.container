---
name: review
description: End-of-day review with the developer — show each task worked today against its done criterion, have the developer explain the change in their own words, then record acceptance or reopen it with what is missing. Use when the developer asks to review the day or close out today's work, or as the first part of the end-of-day block.
---

# The review

The first part of the end-of-day block: review, then retro, then refinement. **Passing tests are necessary and not enough: a task is done when the developer understands it.**

You never accept a task on the developer's behalf, and you never write their explanation for them. **Accepting is not merging**: an accepted task closes when its pull request merges.

## 1. The tracker has to be on

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/needs-tracker
```

If it exits non-zero, tell the developer the line it printed, word for word, and stop.

## 2. Close what has merged

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/review-settle
```

It closes every accepted task whose pull request has merged since, and says what the others are waiting for. Tell the developer what it closed. If it exits non-zero, say what it could not read (usually `gh` not logged in or no network) and carry on: nothing was closed by mistake.

## 3. What to review

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/review-list
```

It lists the tasks in progress and the accepted ones still waiting for a merge. Each comes with its done criterion and its pull request. Review the ones in progress. An accepted one needs nothing more until its pull request merges.

## 4. For each task

1. **Show what changed against its done criterion.** Show the files, the tests, and the behaviour.
   - With a pull request: `gh pr view <n>` and `gh pr diff <n> --name-only`.
   - Without one: `git log` and `git diff` on the branch the work is on. Note that the PR should be recorded with `bd update <id> --set-metadata pr=<n>` once it is opened.

   Say plainly where it falls short of the criterion.
2. **Ask the developer to explain the change in their own words**: what it does, and why it was done that way. Even a trivial change gets a sentence.
3. **If they cannot explain it yet**, walk through it with them: the mechanism, the part that was not obvious, what you found along the way. Then ask again. Do not accept before they can explain it.
4. **The developer decides:**
   - **Accept**, with their explanation exactly as they gave it:
     ```bash
     ${CLAUDE_PLUGIN_ROOT}/bin/review-accept <id> "<their words>"
     ${CLAUDE_PLUGIN_ROOT}/bin/review-settle <id>
     ```
     The second command closes the task now if its pull request has already merged. Otherwise the task waits for the merge.
   - **Reopen**, with what is missing in their words or agreed with them:
     ```bash
     ${CLAUDE_PLUGIN_ROOT}/bin/review-reopen <id> "<what is missing>"
     ```

If a script refuses, tell the developer why, and do not work around it.

## 5. Hand over

Summarise in a few lines what was accepted, what is waiting for a merge, and what was reopened and why. The retro comes next.
