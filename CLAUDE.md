# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Standing answers

- **The mode is Pair Programming Mode.** The agent drives, the user navigates. It governs every
  session until someone says otherwise.
- **The documentation language is English.** Every file written from here on inherits it, including
  the commit messages.
- **Initialization is done.** The charter is `docs/CHARTER.md` and the SRS is `docs/SRS/` — one
  file per section, indexed at `docs/SRS/README.md`. Both agreed at their gates. The chain
  continues at `docs/agent/en/WORKFLOW.md`, one story and one task at a time.

## The rules are not imported, and that is the decision rather than an omission

**This repository carries the normative documents at `docs/agent/`**, in two languages, and ships
them inside the image it builds. A project gets them at `~/.claude/rules/`, written by a boot hook,
where they load with no import.

Nothing here pulls them in with `@path`. An import resolving outside the working directory is an
*external import*; declining its approval dialog once disables those imports permanently with
nothing said afterwards — leaving an agent with no modes, no rules and no gates and no way to tell.
**This file used to import them from a `.code-server/` submodule, and that submodule is gone.**

So read `docs/agent/en/MODES.md` and `docs/agent/en/RULES.md` when you need them. They are in this
tree; nothing is empty until initialised any more.

## The gates, which are in this file on purpose

Written here rather than anywhere that could fail to load:

**Charter, then SRS, then epic, then story with its scenarios, then task with its design, then
code.** Each is agreed with the user before the next is written. A design settled after the code
exists is a justification, and scenarios written after the implementation describe what was built
rather than what was wanted.

## What this repository is

A VS Code extension that runs on the **host** and connects the host's editor to a project's dev
container — and, since the epic `the-extension-carries-the-image`, **the thing that carries the
image too.** `core/` and `stacks/` are here, travel in the `.vsix`, and the extension composes a
project's Dockerfile from them and builds it.

**A project installs this extension and needs nothing else.** No template to vendor, no submodule,
no `setup` on the host. That replaced the arrangement where
[`jvsl.env.agents.code-server`](https://github.com/TheHefty/jvsl.env.agents.code-server) was
vendored into every project; what remains of that repository is its history, merged into this one.

Why, and what this deliberately does not do, is `docs/CHARTER.md` — read it before anything else.

## Commands

```bash
npm test             # unit tests, TypeScript run directly, no build
npm run typecheck    # the only thing that verifies the types — node --test strips them
npm run test:bundle  # builds, then loads the bundle and checks what ships
npm run package      # the .vsix
```

Shell tests are `*.test.sh` beside what they exercise, each with a job in
`.github/workflows/ci.yml`. **`scripts/every-test-has-a-runner.test.sh` fails if one has no job** —
a test nothing runs reports nothing rather than failing, which is indistinguishable from passing.

## What CI does here, and why it takes seven minutes

Twenty-six jobs: the extension's typecheck, unit, package and integration, plus an image build per
stack with each stack's own in-image assertions, plus the guards. A change touching only Markdown
skips the image half and finishes in under a minute — `scripts/changed-scope.sh` decides, and
`scripts/ci-green.sh` is what lets a skipped job count as green.

## Two things that are easy to get wrong here

- **`core/` and `stacks/` are at the repository root on purpose.** `join(extensionPath, 'core')` is
  the same expression in a checkout and in an installed extension only because the names were kept
  rather than moved under a prefix. `src/build/template.test.ts` pins the expression and
  `tools/vsix.test.ts` reads the artifact; neither alone is the claim.
- **What ships in the `.vsix` is an allowlist, not a blocklist.** A list of exclusions cannot see a
  directory nobody thought of: merging the image's content in once took the package from 6 files to
  108 with every test passing.
