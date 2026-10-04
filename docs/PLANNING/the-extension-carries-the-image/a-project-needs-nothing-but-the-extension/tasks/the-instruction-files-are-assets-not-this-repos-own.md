---
status: Draft
story: the-extension-carries-the-image/a-project-needs-nothing-but-the-extension
epic: the-extension-carries-the-image
pr:
---

# Task: the-instruction-files-are-assets-not-this-repos-own

## Summary

The extension ships `CLAUDE.md` and `AGENTS.md` as **tracked assets written for a project**, and
writes them into one when absent. FR-83.

## The story's sketch said "they ship in the bundle" and did not say which ones

Measured, and the answer is not the two files at this repository's root.

**This repository's `CLAUDE.md` is this project's own instructions.** 4352 bytes, and it imports:

```
@.code-server/docs/agent/en/MODES.md
@docs/RULES.md
```

Shipping it to a project would hand that project this extension's standing answers plus **two
imports that resolve to nothing in its tree** — and an import that resolves to nothing says nothing:
no error, no warning, which is the failure this whole arrangement exists to avoid.

**And `AGENTS.md` is not an asset at all.** It is untracked here, 681 bytes, and it shipped in my
local package only because `vsce` packages the working directory. Read from the published artifact
rather than assumed — CI's `.vsix` from run `37057613427` has **62 entries and no `AGENTS.md`**:

```
core/…  stacks/…  dist/extension.cjs  package.json  LICENSE.txt  readme.md  changelog.md
```

**Nothing noticed, and it is worth knowing why.** The allowlist *permits* `AGENTS.md` and does not
require it, so it passes whether the file is there or not; and the completeness assertion covers
`core/` and `stacks/` only. A file can be in one person's package and absent from everybody else's
and both states are green.

## Proposal

`assets/project/CLAUDE.md` and `assets/project/AGENTS.md`, tracked, written for a project rather
than for this repository, shipped and required by the completeness assertion.

**What they contain is deliberately almost nothing in this task.** The normative material arrives in
story 5, which is what gives it a delivery mechanism; a `CLAUDE.md` written now would either be
empty of the rules or carry a copy of them, and the copy is the thing the whole epic exists to end.
What they contain now is the project's own frame — the mode, the gates, what to do if an import did
not load — and a pointer to where the rest will live.

## Three worst failure scenarios

**1. This repository's own `CLAUDE.md` gets shipped by accident.** It is at the root, it has the
right name, and `vsce` packages the working directory. Writing it into a project would deliver two
dead imports and somebody else's standing answers. The assertion is that **what ships is under
`assets/`**, by path, rather than that the root one does not — the second is a weaker claim that an
allowlist already fails to make.

**2. An untracked file is shipped by one person and nobody else.** Exactly what `AGENTS.md` does
today. The completeness assertion has to require the assets, not merely permit them, because
permitting is what let this happen.

**3. The write destroys somebody's work.** Both files are tracked in a project and carry its own
answers — the reference monorepo's `CLAUDE.md` is 20 KiB of them. The rule is the one
`src/devcontainer.ts` already states: *anything else, including a file that cannot be parsed, is
somebody's work, and the open refuses rather than overwriting it.* **The marker that makes a file
ours cannot be the one `devcontainer.json` uses** — that is a JSON key, and these are Markdown.

## Verification

| Test | Asserts |
|---|---|
| `vsix.test.ts` | the assets ship, **required** rather than permitted; and `AGENTS.md` at the root does not |
| a new unit test | writing into a directory with neither file writes both |
| the same | a file already there that this extension did not write is left alone, and the refusal names it |
| the same | a file this extension *did* write is overwritten, because that is an upgrade rather than somebody's work |
| `nothing-reads-the-submodule.test.sh` | still green: the assets must not import from a submodule |

The fourth is the one with a decision in it: recognising our own Markdown needs a marker, and an
HTML comment is the only form that is invisible in rendered output and survives an editor that
reformats.

## Out of scope

- **What the normative documents say, and delivering them** — story 5.
- **Activation** — the story's second task.

## Open questions

None, but one thing recorded for story 5: if `CLAUDE.md` is to import the rules rather than copy
them, the import has to resolve inside the workspace. Story 5's mechanism writes them to
`/config/.claude/rules/`, which loads them **without** an import — so this file may end up importing
nothing at all, and saying where the rules come from in prose instead.

## Outcome

Filled in when the status leaves `Draft`.
