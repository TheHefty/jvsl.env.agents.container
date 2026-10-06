# Task: initialising leaves the repository alone

| | |
|---|---|
| **Story** | `the-image-carries-bd` |
| **Date** | 2026-10-06 |
| **Depends on** | `the-tracker-exists-when-asked-for` (shipped) |

## Summary

The boot hook stops calling `bd init` in the person's repository. A fresh clone is restored with
`bd bootstrap`. A first opt-in is initialised in a throwaway clone, and only its `.beads/` is
brought back. Either way there is no commit, the index is untouched, and nothing is installed for
agents, editors or git hooks. The tracker travels by `bd dolt push`, run by the agent alongside every
`git push` the operator approves. FR-116 as amended, and FR-121.

## Problem

Measured against bd v1.3.1 in throwaway repositories on 2026-10-06:

- **`bd init` commits on its own, every time it initialises a database in a git repository**, and
  the commit sweeps in whatever the person had staged. On a first opt-in it commits `.beads/`. In a
  fresh clone, where `.beads/` is already tracked, it still commits whatever was staged. No flag
  turns this off, and hiding git from it (`GIT_DIR`) makes it fail half-way and leave a partial
  `.beads/`.
- **Without `--skip-agents` and `--skip-hooks` it installs far more than a tracker**: a
  `SessionStart` hook in `.claude/settings.json` that runs `bd prime` into every session, blocks in
  `CLAUDE.md` and `AGENTS.md`, Codex and Cursor hooks, an `.agents/` skill, and a `core.hooksPath`
  pointing at `.beads/hooks`. What `bd prime` tells the agent contradicts FR-106 and this epic.
- **The shipped hook does all of the above** to the first project that sets `"beads": true`.

## Proposal

The hook reads the same explicit yes it reads today, then takes exactly one of four paths:

| On boot | The hook |
|---|---|
| No opt-in | exits, as today |
| A local database already exists | exits. A second boot changes nothing |
| `.beads/` is tracked, no local database (a clone, another machine) | `bd bootstrap`, which restores from the remote without committing, then `git config beads.role maintainer` |
| No `.beads/` (the first opt-in) | clones the workspace into a temporary directory, runs `bd init --non-interactive --skip-agents --skip-hooks --prefix <project>` there, copies `.beads/` back, appends bd's five ignore lines to `.gitignore` if they are missing, and sets `beads.role` |

All of it runs as `abc`, as today. **The throwaway clone takes the workspace's `origin` URL**, so
`.beads/config.yaml` carries the same `sync.remote` a later clone will derive, and `bd bootstrap`
there has nothing to rewrite.

**The new files are left uncommitted**, and the hook says so once in the boot log. The agent names
them and proposes them as their own commit, asked for like any other.

**The push.** The normative documents gain one sentence, in both languages, under "when a project
has a tracker": the agent runs `bd dolt push` in the same step as each `git push` the operator
approves, and never otherwise. It is the operator's approval that sends both.

**The comment in `45-beads.sh` that says "the export is what travels" is corrected** with the code.

## Three worst failure scenarios

| # | Scenario | How it manifests | Test that catches it |
|---|---|---|---|
| 1 | **The repository is changed anyway.** A path still reaches `bd init` in the workspace, or a later bd release adds something the throwaway clone carries back | a commit nobody made, a staged file gone from the index, a `CLAUDE.md` block or `.claude/settings.json` that tells every session to create items | `core/booted.test.sh` against the real image: stage a file, boot a first opt-in, and assert HEAD unchanged, the index byte-identical, and no `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.codex/`, `.cursor/`, `.agents/` and no `core.hooksPath`. Then the same for a clone of it, which takes the bootstrap path |
| 2 | **A boot hangs or dies on the network.** `bd bootstrap` fetches from the remote, and a container started offline, or against a remote that needs a credential the boot does not have, waits or fails | a container stuck before the editor connects, which looks like the editor's fault and names no cause | the hook bounds `bd bootstrap` with `timeout`. On expiry or failure it says, in one line of the boot log, what it tried and why the tracker is empty, and the boot continues. Tested by `45-beads.test.sh` with a stub `bd` that sleeps, and one that fails |
| 3 | **The copy is not a working tracker.** The throwaway clone's `.beads/` depends on something outside it, such as an absolute path, or the role or prefix bd would have set itself | every bd command warns or fails in the workspace, or ids carry the temporary directory's name | `core/booted.test.sh` after the first opt-in: `bd create` then `bd list` as `abc` succeed with nothing on stderr, and the id starts with the project's prefix |

## Blast radius

- **`core/cont-init/45-beads.sh`**, which only runs for a project with `"beads": true`. None has it
  today, so nothing that exists changes behaviour until somebody opts in.
- **`core/booted.test.sh`** and **`core/cont-init/45-beads.test.sh`**, and the stub
  `core/booted.test.fixture/bd-stub.sh`, which must learn `bootstrap`.
- **`docs/agent/{en,pt-BR}/RULES.md`**, one sentence each. These ship to every project that bumps,
  so the change is `feat`, not `docs`.

## Alternatives considered

- **Let bd commit, then undo it** with a temporary index and `git reset --soft`. Not measured. The
  project's own commit hooks would run on bd's commit, and a crash between commit and reset leaves
  the commit behind. Declined by the operator in favour of the measured path.
- **Take `init` out of the boot** and make it a command the operator runs. bd would still sweep the
  index unless the command refused a non-empty one, and a fresh clone would no longer be ready on
  its own. Declined.
- **A `pre-push` git hook that runs `bd dolt push`.** Automatic, but opt-in per clone and skipped by
  `--no-verify`. Declined: the push rides on the approval that already exists.

## Verification

- `core/booted.test.sh` on the real image (CI, `core-booted`) for scenarios 1 and 3, on both paths.
- `core/cont-init/45-beads.test.sh` for scenario 2 and for the path selection.
- **Not reachable by CI:** `bd dolt push` against GitHub with the container's credential. Only a
  local bare remote has been measured. It is verified by hand on the operator's first push of a
  project that opted in, and recorded in this task's outcome.

## Open questions

None. What to do instead of `bd init` in the repository, and who commits the new files, were settled
by the operator on 2026-10-06.

## Outcome

Filled in when the task closes.
