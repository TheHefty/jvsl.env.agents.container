---
name: refine
description: Refinement with the developer — grill the next candidate items or a new idea, propose stories and tasks in the tracker, and agree or reject them on the developer's word, so tomorrow's daily has agreed tasks to pick. Use after the retro at the end of the day, or when the developer asks to refine or plan the next work.
---

# Refinement

The last part of the end-of-day block (review, retro, refinement). It is where **the chain's gates happen on the daily calendar**. Stories, with their scenarios, and tasks, with their done criteria, are proposed here and agreed by the developer. Only agreed tasks reach a daily.

Refinement proposes **stories and tasks**. An epic is agreed at the SRS gate, with its sentence, and is not proposed here.

## 1. The tracker has to be on

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/needs-tracker
```

If it exits non-zero, tell the developer the line it printed, word for word, and stop.

## 2. The agenda

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/refine-candidates
```

It lists four things:
- proposals awaiting agreement;
- agreed stories with no agreed task (nothing in a daily can come from them yet);
- tasks with no done criterion (the daily would refuse them);
- what tomorrow's daily can already pick.

Ask the developer what to refine: something from the agenda, or a new idea of theirs.

## 3. Grill before writing

For each item, before writing anything, ask about:
- **the problem**: what is wrong or missing, for whom, and how it shows;
- **who it is for**;
- **edge cases**;
- **risks**;
- **what is out of scope**;
- **how it will be known to be done**. For a task, this becomes its done criterion. For a story, its scenarios.

**Ask instead of assuming.** Where a requirement is unclear, ask the developer. Never fill the gap yourself.

A task that would not fit in one day is split into tasks that each fit in a day.

## 4. Propose

Write the body and the acceptance to files, then run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/refine-propose story <epic-id> "<title>" <body-file> <scenarios-file>
${CLAUDE_PLUGIN_ROOT}/bin/refine-propose task <story-id> "<title>" <body-file> <criterion-file> [<id it waits on>...]
```

- A story's acceptance is its scenarios, in Gherkin (`Scenario:` / `Given` / `When` / `Then`), in the project's documentation language.
- A task's acceptance is its done criterion.

The script refuses a story outside an agreed epic, a task outside an agreed story, a task with no criterion, and a story with no scenario. Fix what it names.

## 5. The developer's word

Show each proposal and let the developer answer:
- **Agreed**:
  ```bash
  ${CLAUDE_PLUGIN_ROOT}/bin/refine-agree <id>...
  ```
- **Rejected**, with their reason:
  ```bash
  ${CLAUDE_PLUGIN_ROOT}/bin/refine-reject <id> "<why>"
  ```
  This closes it and never deletes it, so the same draft does not come back.
- **Changed**: change it with `bd update`, then ask again.

Agree a story before proposing tasks under it. The chain is agreed in order.

## 6. Hand over

Run `refine-candidates` again and show its **Agreed and ready** section: that is what tomorrow's daily can pick. Then stop.
