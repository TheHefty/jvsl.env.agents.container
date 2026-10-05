# Task: the tracker exists when a project asks for it

| | |
|---|---|
| **Story** | `the-image-carries-bd` |
| **Date** | 2026-10-05 |

## Summary

The image installs `bd` at a pinned version with its checksum verified. A boot hook runs
`bd init` for a project whose manifest asks for it, as `abc` rather than as root. The export that
travels is a command somebody runs. FR-100, FR-101, FR-116.

## Problem

Nothing below this exists without it, and `bd init` is explicit — nothing in the tool works before it
has been run. So a project that opted in needs the binary, a database, and both to belong to the user
the container runs as.

## Proposal

**Four parts, and only the first two touch the image.**

1. **Install.** `beads_<version>_linux_amd64.tar.gz` fetched and its published `checksums.txt` entry
   verified, by the rule `ai-jail` and `ai-memory` already follow. Not the project's install script:
   a script fetched and piped to a shell verifies nothing about what it fetched.
2. **Initialise at boot, as `abc`.** A `core/cont-init/` hook, in the shape `40-ai-memory.sh`
   already has — including `s6-setuidgid abc`, for the reason in the failure scenarios below.
3. **Opt in through the manifest.** A field in `.agent-container.stack.json`, which the extension
   already writes and already fills by asking. No second marker file: `bd` does not recognise one,
   and a name at a project's root that only this template understands is a thing to explain forever.
4. **Export by hand.** `bd export -o <tracked path>` is a command, not a hook.

**No `BEADS_DIR` and no sandbox grant.** FR-103 was struck: the tracker lives in the repository, the
workspace is already mapped read-write by `ai-jail`, and `bd` finds its database by walking up from
the working directory.

## Three worst failure scenarios

**1. The export is never run, and the work is lost at the moment it is needed.** The requirement is
*"se precisar trocar de máquina ou baixar um repositório de novo, poder continuar de onde parou"*. A
manual export satisfies it **only when somebody remembered** — and the moment that is discovered is
the new machine, when the old one may not be reachable. This is the worst of the three because
nothing fails until the information is already gone.

*Not covered, deliberately.* The operator chose a command over a git hook, and over a hook plus a CI
guard that would have made forgetting loud. Recorded here rather than argued: the mitigation exists
and was declined, so the risk is carried knowingly rather than unknowingly.

**2. The hook initialises a project that never asked.** The opt-in is a field in a JSON file. A
manifest that does not parse, or one where the field is absent, must read as *no* — and the cost of
being wrong is a database and a `.gitignore` entry written into somebody's repository by something
they did not run.

*Covered by:* the hook reading the field with `jq` and treating every failure — missing file, invalid
JSON, absent field, any value that is not an explicit yes — as no. Tested against each of those
shapes, the same way `40-ai-memory.test.sh` drives its marker.

**3. The database belongs to root.** The hook runs before s6-overlay drops privileges. `bd init`
writes into the workspace, which is bind-mounted from the person's own machine — so a root-owned
`.beads/` would be a directory the user cannot write, in their own repository, created by a container
start. **This is not hypothetical: it is the exact defect `10-state-ownership.sh` exists to repair**,
and it arrived there through a connection running as root.

*Covered by:* `s6-setuidgid abc`, as `40-ai-memory.sh` does, and an assertion on ownership in a
booted container rather than in a built image — the lesson the state-directory debt left on the same
day.

## Blast radius

- **50.8 MB** added to every image, opted in or not. The binary ships because the image is one
  artefact; only the database is conditional.
- **A project that does not opt in** sees no new file, no database and no change at all.
- **The export path is ours to choose.** Under `docs/` it is treated as documentation by
  `scripts/changed-scope.sh`, so changing work items would ask for five CI jobs rather than
  twenty-seven — which is correct, because a work item cannot change an image.

## Alternatives considered

- **A marker file, as `ai-memory` uses.** Rejected: the manifest is already written and already
  filled by asking, and FR-108 puts the question in the panel that writes it.
- **`bd hooks install` plus `export.git-add`.** Declined by the operator. It is what makes the export
  happen without anybody thinking — and `RULES.md` names its cost: a local hook is opt-in per clone
  and skippable, so a new machine is exactly where it is not installed.
- **A CI job comparing the committed export against the database.** Declined with the above. It is
  the only arrangement that makes forgetting loud rather than silent.

## Verification

- **The install** is asserted on the built image: `bd` reports the pinned version.
- **The hook's decision** is a function of the manifest, tested against absent, unparseable, field-less
  and explicit-no inputs.
- **Ownership and existence** are asserted in a booted container — `core/booted.test.sh` already boots
  one, and already carries the argument for why a build-time assertion would prove nothing.
- **The `@manual` scenario** the story names: that an agent inside the sandbox reaches the same
  database a person does, which no test outside a real sandbox can settle.

## Open questions

None. What remained — whether `BEADS_DIR` survives, where the export goes, and when it runs — was
settled on 2026-10-05.

## Outcome

Filled in when the task closes.
