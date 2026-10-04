---
status: Done
story: the-extension-carries-the-image/the-documents-arrive-with-the-image
epic: the-extension-carries-the-image
pr: 64
---

# Task: the-submodule-goes

# Summary

`.code-server/` stops being a submodule of this repository. FR-82's last half, and the thing that
makes `jvsl.env.agents.code-server` archivable.

## It could not come earlier, and that is not sequencing for its own sake

`CLAUDE.md:32` imports `MODES.md` from inside it. Until the previous task put the documents in the
image and `docs/agent/` in this repository, removing the submodule would have left this project
working with **no modes and no rules** — and an `@path` that resolves to nothing says nothing: no
error, no warning, only the line left visible with no content behind it. That is the failure this
project's own `CLAUDE.md` describes as the reason those words are in its body rather than in an
import.

## What depends on it, measured

| | |
|---|---|
| `CLAUDE.md` | **six** references — lines 15, 20, 30, 32, 38 and 43. One is the import; the rest describe an arrangement that is ending |
| `AGENTS.md` | one, telling a reader to open two paths by hand if the imports did not resolve |
| `.gitmodules` | the submodule itself |
| `package.json` | **the marketplace description** — *"Opens a project built on the jvsl.env.agents.code-server template"* |

**The description is the one nobody would have looked for.** It is what a person reads before
installing, it names a template a project no longer needs, and nothing in this repository checks it.
It was not in the story, the SRS or the charter.

## Three worst failure scenarios

**1. The import is removed and this project is left with no rules.** The same failure the submodule
arrangement had, arrived at from the other direction. `CLAUDE.md` must name where the rules are
*before* the import goes, and the body has to carry the mode and the gates — which this project's own
`CLAUDE.md` already does for exactly this reason, and which the shipped asset was written to do for
projects.

**2. A guard goes green because its subject left rather than because it passed.** Three of them
exclude or prune `.code-server/`: `no-launcher.test.sh`, the `bash-syntax` job, and `.vscodeignore`.
Each becomes inert, and an inert exclusion is indistinguishable from a working one. They are removed
with the submodule rather than left as lines nobody can tell are dead.

**3. A document cites a path inside it.** `docs/agent/en/RULES.md` names
`.code-server/scripts/check-md-size.sh` — written for a project that vendors the template, which is
the stale-premise problem the previous task recorded rather than fixed. **With the submodule gone,
`agent-docs-cite-real-files.test.sh` turns that from a premise into a red check**, which is the first
time anything has forced one of those passages to be corrected. Good: a stale premise that fails a
test is better than one that reads plausibly.

## Verification

| Test | Asserts |
|---|---|
| `agent-docs-cite-real-files.test.sh` | expected **red** on removal, and the document is what changes |
| `nothing-reads-the-submodule.test.sh` | still green, now vacuously — and the floor is what keeps it honest |
| a new manifest rule | the description names no template |
| `git submodule status` | empty |

## Out of scope

- **Archiving `jvsl.env.agents.code-server`.** This task is what makes it possible; doing it is the
  user's, and it is the one step in this epic that cannot be undone by a revert.
- **The documents' other stale premises.** One passage is forced here by a failing check; the rest
  stay recorded in `docs/agent/README.md`.

## Outcome

Implemented in #64. `git submodule status` is empty. 124 unit tests, typecheck clean, every guard
green.

**This design missed the most important dependency.** It counted six references in `CLAUDE.md` and
did not list `docs/RULES.md:7`, which imported `@../.code-server/docs/agent/en/RULES.md` — **the
rules themselves**. Removing the submodule without noticing would have left this project with the
import line visible and nothing behind it, which is the exact silent failure the whole arrangement
exists to prevent. It is not repointed at `docs/agent/en/RULES.md`: it is removed, and the file says
where the rules are in prose, because an import is only safe when it resolves inside the working
directory and this one is one directory up.

**And the third failure scenario did not happen, for a reason that is better than my prediction.**
I expected `agent-docs-cite-real-files.test.sh` to go red on `.code-server/scripts/check-md-size.sh`
and force a stale passage to be corrected. It strips that prefix before resolving — with a comment
saying the check's first version reported exactly this as missing, and that it was a false positive
about a citation that is correct for its reader. **So nothing forces those passages**, and the stale
premises recorded in `docs/agent/README.md` stay recorded. The hope that a test would do the work was
mine, not the design's.

**`CLAUDE.md` was rewritten rather than edited.** Six references was the measurement; what the file
actually needed was more — it still said the extension *"opens nothing yet"*, that generating the
dev container configuration was *"the next task"*, and named `templateMinVersion` as the declared
minimum after that field was deleted. It had been describing a state five stories old.

**Three exclusions went inert and went with the submodule**, because an exclusion for something
absent is indistinguishable from one that works: `.vscodeignore`'s entry, the `bash-syntax` prune,
and `no-launcher.test.sh`'s `^.code-server/` filter.

**And a fourth thing went that nothing asked about.** That guard's floor used `code-server` as the
string that proves its search works. Eighty files still carry the word — all of them history, in
comments about the base the image used to have. **A canary whose presence is accidental is one a
tidy-up removes**, and then the guard reports a broken mechanism when nothing is broken. It is `jvsl`
now: in the package name, in every contributed command, and in the marker the instruction assets
carry.
