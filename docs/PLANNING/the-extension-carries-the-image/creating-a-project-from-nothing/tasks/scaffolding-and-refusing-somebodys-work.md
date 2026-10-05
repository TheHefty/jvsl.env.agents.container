---
status: Draft
story: the-extension-carries-the-image/creating-a-project-from-nothing
epic: the-extension-carries-the-image
pr:
---

# Task: scaffolding-and-refusing-somebodys-work

## Summary

The answers become files in a directory, and `git init` with one commit. FR-90's second half and
FR-91. **The task where this story can destroy something.**

## What gets written

| | |
|---|---|
| `.code-server.stack.json` | the manifest — stacks with versions, and limits. The shape this repository's own has: stack keys at the top level, `limits` beside them |
| `CLAUDE.md`, `AGENTS.md` | from `assets/project/`, through the `instructionWrites` that story 4 built |
| `.ai-memory.toml` | only when asked for, with the content `aiMemoryMarker()` already returns |
| `.gitignore` | `.devcontainer/`, because the extension **refuses to open a project that does not ignore it** |

**That last row is the one a sketch would miss.** `open.ts` refuses when `.gitignore` does not ignore
the generated configuration — so a project scaffolded without one is created and then declines to
open, which is the worst possible first impression. The check already exists; this is the flow that
has to satisfy it.

## The destructive risk, and why checking twice is not belt-and-braces

`checkLocation` already refuses a directory with anything in it, **at the point the question is
answered.** That is not enough: somebody answers six more questions afterwards, and a directory can
gain files in between — a clone finishing, an editor saving, another window's scaffolding.

So it is checked again immediately before the first write, and **the second check is the one that
protects anything.** The first exists only so the questions are not wasted.

## Three worst failure scenarios

**1. A partial scaffold is left behind.** Five files and a `git init`: if the third write fails —
permissions, a full disk, a path that became a file — the directory now holds half a project and is
no longer empty, so **trying again is refused by the check that was protecting it.** Somebody is left
with a directory they must clear by hand and no statement of what was written. Either everything
lands or what landed is named.

**2. `git init` runs in a directory that is already a repository.** The check looks for *any* entry,
and `.git` is an entry — so a repository is refused for being non-empty, which is right. But a
directory that gained `.git` between the two checks, or one where `git init` is run twice, gets a
second initialisation over somebody's history. `git init` on an existing repository is not
destructive in itself, and **the commit that follows it is**: it would add a first commit to a
history that already has one.

**3. The commit is made as somebody the project is not.** `git commit` in this container fails with
`Author identity unknown` unless an identity is configured, and the agent's `/config` is a tmpfs
without one. Guessing an identity writes a commit nobody made. **The scaffold's first commit has to
come from the person's own git configuration, or not be made at all** — an unconfigured git means a
scaffolded directory with no commit and a sentence saying why, not an invented author.

## Verification

| Test | Asserts |
|---|---|
| a new unit test | what the scaffold *would* write, as a list of path-and-content pairs — pure, so the set is assertable without a filesystem |
| the same | `.gitignore` carries `.devcontainer/`, asserted against `ignoresGeneratedConfig` rather than against a literal, so the two cannot drift |
| the same | `.ai-memory.toml` is absent unless asked for |
| the same | the manifest's shape matches what `nextManifest` produces, so a project created here and one configured later agree |
| a new test | a directory that gained a file between the two checks is refused before anything is written |
| the same | an unconfigured git identity yields no commit and a reason, not a commit |

**The first is the shape that makes the rest possible**: deciding what to write, as data, before
writing any of it. It is also what makes scenario 1 answerable — a plan that is a list can be
written in full or reported in full.

## Out of scope

- **Surviving the window reload** — the next task. This one ends with a directory that is a project.
- **Opening it** — story 6's flow takes over once the manifest exists, which is the story's fifth
  scenario.

## Outcome

Filled in when the status leaves `Draft`.
