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

## The boundary with the template

- **A change to the image is made in the template repository**, planned under its epic, verified by
  its CI, and consumed here through a version bump. Nothing about the image is fixed by working
  around it here.
- **The minimum template version is declared and checked at runtime**, and a project below it is
  refused with a message naming the version found, the version needed, and the command that fixes
  it. The submodule being uninitialized is the same class of failure and gets the same treatment —
  it is the silent one the template's own `CLAUDE.md` warns about.
