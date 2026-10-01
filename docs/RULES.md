# Rules

The inherited rules, shipped by the template and updated by bumping it. They are not edited here:
a rule that needs changing is changed in `.code-server/docs/agent/`, where changing it reaches
every project that bumps rather than only this one.

@../.code-server/docs/agent/en/RULES.md

---

Everything below this line belongs to this repository.

## The generated dev container configuration

- **`.devcontainer/devcontainer.json` is generated and gitignored.** The source of truth is
  `.code-server.stack.json` in the project being opened, plus what the host actually has. It is
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
