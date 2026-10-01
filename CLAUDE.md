# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Standing answers

- **The mode is Pair Programming Mode.** The agent drives, the user navigates. It is described in
  the import below, and it governs every session until someone says otherwise.
- **The documentation language is English.** Every file written from here on inherits it, including
  the commit messages.
- **Initialization is unfinished until the SRS is merged.** The charter is written
  (`docs/CHARTER.md`); the SRS is the next link and the next gate. The `INITIALIZATION.md` import
  below comes out when it lands.

## If the imports below did not load

The normative documents — the modes and the rules — ship from the template and are pulled in by the
`@path` lines below. They live inside the `.code-server/` submodule, which is **empty until
`git submodule update --init`**, and an import that resolves to nothing **resolves to nothing
silently: no error, no warning**. The one cue left is that the `@` line stays visible with no
content behind it.

So: if you cannot see the pairing modes or the ground rules in your context, **stop and say so**
rather than proceeding. An agent working without them is not working under a lighter process, it is
working with no mode, no rules and no gates, and nothing failed to tell anybody. Four gates in
particular exist and are not optional — the charter agreed with the user before the SRS, the SRS
before any story, a story's scenarios before its tasks, and a task's design before its code. The
chain is `.code-server/docs/agent/en/WORKFLOW.md`.

@.code-server/docs/agent/en/MODES.md
@.code-server/docs/agent/en/INITIALIZATION.md
@docs/RULES.md

## What this repository is

A VS Code extension that runs on the **host** and connects the host's editor to a project's dev
container, replacing the Tauri launcher (`.code-server/start`) that the
[`jvsl.env.agents.code-server`](https://github.com/TheHefty/jvsl.env.agents.code-server) template
ships today. Why, and what it deliberately does not do, is `docs/CHARTER.md` — read it before
anything else.

The template is vendored here as a git submodule at `.code-server/`, the same way a consuming
monorepo vendors it, for two reasons: this project is worked on under the rules the template ships,
and it is developed inside a container built from the template's own image.

**There is no code yet.** The chain is at the charter; the SRS is next.

## The two repositories

Half of what the first release needs is a change to the **image**, not to this extension — the
`abc` user's shell, a `devcontainer.metadata` label, idempotent `cont-init` ownership fixes, a
read-only `.vscode/` in the ai-jail profile. Those are the template's, and they are planned and
merged there, under its own epic in its own `docs/PLANNING/`. They are verified by the template's
CI, which is the only one that builds images.

This repository plans and builds the extension, declares the minimum template version it needs, and
verifies that version at runtime. A change that belongs in the image does not get made here.

## Development

The extension runs on the host; this repository's working tree is a bind mount, so the same folder
is open on both sides at once. The loop is two windows: one attached to the container, where the
agent edits inside the jail, and one plain host window over the same folder, where `F5` opens the
Extension Development Host. Packaging a `.vsix` is for acceptance before a release, not for
iteration.
