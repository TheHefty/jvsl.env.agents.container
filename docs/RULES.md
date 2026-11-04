# Rules

**The ground rules are not imported here, and not copied here either.** They are at
`docs/agent/en/RULES.md`, this repository carries them, and the image this extension builds
delivers them to a project at `~/.claude/rules/` — where they load with no import at all.

Nothing in this file pulls them in, deliberately. An `@path` that resolves outside the working
directory is classified as an *external import*, and declining its approval dialog once disables
those imports permanently with nothing said afterwards. This file used to import
`@../.code-server/docs/agent/en/RULES.md` from a submodule; that submodule is gone, and the import
went with it rather than being repointed.

---

Everything below this line belongs to this repository.

## The generated dev container configuration

- **`.devcontainer/devcontainer.json` is generated and gitignored.** The source of truth is
  `.agent-container.stack.json` in the project being opened, plus what the host actually has. It is
  regenerated on every open and **never hand-edited** — an edit there is lost without warning, the
  same contract `.code-server/Dockerfile` already has.
- **It cannot be versioned, and that is not a preference.** `--cpuset-cpus` is derived from the
  host's core count and `--device` entries from paths that exist on that host; `docker run --device`
  against a missing path is a hard failure, not a no-op. A file carrying one machine's answers
  breaks the next clone.
- **`initializeCommand` is a guard, never a generator.** It runs after the configuration has been
  read, and its ordering against the Docker commands is unspecified — there are open bugs where
  compose is inspected first. Anything dynamic is computed by this extension *before* it hands over
  to Dev Containers.

## The image is this repository's

- **A change to the image is made here, in `core/` and `stacks/`**, planned under its epic like any
  other change and verified by this repository's CI, which builds an image per stack and runs each
  stack's in-image assertions. A project receives it through an extension update and a rebuild.
  There has been no template repository to make it in since the charter's third amendment, and no
  minimum template version to check: the extension *is* the template, so there is no second version
  to disagree with.

## The agent CLIs are installed unpinned, as an exception

**This is this repository's exception to the inherited "pin a version and verify a digest"**, and
the one place the image disagrees with the rules it ships — on purpose, and said here so that the
disagreement is not a quiet one. `core/Dockerfile.frag` installs the three agent CLIs,
`@anthropic-ai/claude-code`, `@openai/codex` and `opencode-ai`, from npm with no version.

- **Why.** The pin bought the image not changing under a project on a rebuild that changed nothing
  in it, and cost an agent CLI frozen at whatever number somebody last typed, missing fixes, for as
  long as nobody remembered to bump it. Claude Code and Codex were pinned from 2026-08-30 to
  2026-10-06, and the pin was removed deliberately; OpenCode was added unpinned on 2026-10-30.
- **Why only these.** A regression in an agent CLI is in front of somebody immediately. One in the
  sandbox is silent — the environment lost its network once to an `ai-jail` release that made it
  opt-in, and it presented as a host fault that did not exist — so `ai-jail`, `ai-memory` and every
  other fetch keep their tag and their digest.
- **What it costs.** Two rebuilds of the same commit can install different agent versions, and a
  failure that appears after a rebuild has one more candidate cause. `npm list -g` inside the
  container names what is actually installed, which is where to look first.
- **Widening it is a decision, not a precedent.** Another unpinned install is argued here first.
