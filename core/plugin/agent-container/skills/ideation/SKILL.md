---
name: ideation
description: Mark an idea ready in the ideation container — consolidate into its IDEA.md what lives only in this container's memory, show it to the developer, and set the state through idea-check only on their word. Use when the developer wants an idea marked ready, asks whether an idea is ready, or wants to start a project from an idea that is not ready yet. Writes no code.
---

# Ideation: marking an idea ready

The ideation container's rules are `IDEATION.md`: no code is written, one folder per idea, one conversation for all of them. This skill is the one step those rules say must not be skipped: **before an idea is `ready`, what lives only in memory is consolidated into its `IDEA.md`.** The memory is this container's and does not follow the idea into its project; only `IDEA.md` crosses, so whatever is not written there is lost when a project is created from it.

The state changes **only on the developer's word**. Asking whether an idea is ready is not that word, and neither is a full `IDEA.md`.

## Marking an idea ready

The idea is `ideas/<slug>/`, chosen by the developer. If it is not clear which idea they mean, ask; never pick one.

1. **Read the memory for the idea.** Query this container's memory for the idea by its slug and its subject: every decision taken in conversation, every alternative weighed, every question raised.
2. **Compare it with `IDEA.md`.** List what the memory holds that the file does not: the decisions, the alternatives discarded and why, the stack, and the questions still open. Something already in the file in other words is already there.
3. **Write what is missing into IDEA.md**, under its four sections as the contract spells them — `## Purpose and who it is for`, `## Decisions and discarded alternatives`, `## Stack`, `## Open questions`. A discarded alternative keeps its reason. A question nobody answered stays a question; never answer it to fill the section.
4. **Show the developer what was added**: each addition, under its section. If nothing was missing, say so.
5. **Ask whether to mark it ready.** Wait for the answer. If they want changes, make them and show them again.
6. Only on their yes, run:

   ```bash
   ${CLAUDE_PLUGIN_ROOT}/bin/idea-check --set ready ideas/<slug>
   ```

   It checks the idea as `ready` and changes the `state:` line only if the contract accepts it. On success it prints `<file>: <from> -> ready`; tell the developer that line.

   If it refuses, tell the developer each line it printed, word for word. The file was not changed and the idea keeps its state. A section it names as empty is one the conversation has not filled: go back to it with the developer, rather than writing something to get past the check.

**Never edit the `state:` line by hand**, for `ready` or any other state: `idea-check --set exploring` and `idea-check --set discarded` do the same for those, under the same rule — the developer's word first. **Never write `became project`**: the extension marks it when *Create project* starts from the idea, and `idea-check` refuses to.
