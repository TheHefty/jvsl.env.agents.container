---
name: planning
description: Start the working day with the developer — read the tracker and yesterday's journal, propose today's tasks, and claim only what the developer confirms. Use when the developer asks to start the day, plan the day, or plan today's work. Writes no code.
---

# Planning

The start of a working day with the developer. It ends when today's plan is agreed and claimed. **It writes no code**, and nothing is started that the developer did not choose.

The ceremonies are the calendar of the project's chain — epic, story, task, code — not a way around it. The planning picks **only agreed tasks**. Anything else goes back to refinement.

## 1. The tracker has to be on

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/needs-tracker
```

If it exits non-zero, tell the developer the line it printed, word for word, and stop.

## 2. Read the day

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/planning-brief
```

Present its four sections in plain words:
- what is **in progress**;
- what is **blocked**, and by what;
- what is **ready**;
- what yesterday's journal **left open**. The journal is read from the developer's private repository and from the entries still waiting on this machine. If the brief says an entry is not sent yet, or that the journal could not be read, tell the developer, in its words. If it says the tracker still holds journal entries, offer to move them. Only with the developer's yes, run `${CLAUDE_PLUGIN_ROOT}/bin/journal-move` and tell them each line it prints, including the last one: the tracker's history still holds what was removed.

Do not add items it does not list, and do not drop any it does. It already applies the rules: an agreed task is neither deferred nor a proposal, a blocker counts until it is closed, and a parent never blocks.

## 3. Propose, and let the developer choose

Propose a short list from **Ready**, in the order the brief gives (priority, then what each task unblocks, then age). Carry over what yesterday left open, if anything. Say why each one is on the list, in one line.

**The developer decides.** They can drop, add or reorder. Do not mark anything in progress at this step.

## 4. Check what was chosen

Run, with the ids the developer chose:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/planning-check <id> [<id>...]
```

For each line that is not `ok`:
- **A proposal, a story, an epic or a deferred item**: say it is not ready and why, using the line. Leave it for refinement. Do not start it, and do not write a task for it here.
- **Blocked**: say by what. It is not started today unless the blocker is.
- **No done criterion**: ask the developer what will show the task is done. Write their answer with `bd update <id> --acceptance "<their words>"`, then run `planning-check` on it again.

Never fill in a criterion yourself.

## 5. Confirm, then claim

Show the final list and ask the developer to confirm it. Only after they confirm, claim each task in the developer's name:

```bash
bd update <id> --claim --actor "<name>"
```

The name is `git config user.name` in the project. If that is empty, ask the developer for the name to record. Suggest they set it once with `git config user.name "<name>"` in the repository, so the tracker stops recording `unknown`.

## 6. Stop

Summarise today's plan in a few lines: what was claimed, what was sent back to refinement and why. Then stop. Building starts when the developer asks for it.
