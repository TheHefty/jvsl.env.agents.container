# Epic: Beads tracks the work

**The work items stop being files, and gain a place to be read.**

The epic closes when an epic, a story and a task design live in the tracker rather than beside it,
`.beads/issues.jsonl` is versioned like everything else, and a board in the editor shows the whole
shape — hierarchy, content and state — without anybody opening a directory tree.

**It was grilled on 2026-10-05 and reversed the same day, before any code existed.** What the first
grilling settled was the opposite split: documents keep what was agreed, the tracker keeps state. It
was reversed by the operator saying plainly what the whole thing was for — *"preciso de lugar pra
ler, quando aprovar eu venho aqui e digo aprovado"*. A reading surface was the requirement; the first
decomposition had assumed the requirement was tracking.

**What survived the reversal is what the grilling measured rather than what it decided.** Those facts
cost the session and did not change: the storage engine is embedded, so there is no service and no
resident memory, and the cost is 50.8 MB of image; `bd init` is explicit, which is why a boot hook
exists at all; `--external-ref` exists for an item that came from elsewhere; `bd dep tree` and
`bd graph` exist; and Beads ships `bd remember`, which stays unused because `ai-memory` already holds
knowledge.

**The split, and its criterion: where a document stops changing.**

| | |
|---|---|
| **charter, SRS** | stay markdown in the repository, reviewed in a pull request. Argued over, changed rarely, and changing everything when they do |
| **epic, story, task** | live in the tracker, and their markdown is deleted. Worked on — read far more often than reviewed, and the reading had no home |

**What it costs is accepted rather than discovered.** Reviewing a change to a work item becomes
reading a diff of JSONL where a markdown file used to show it. The two documents that still need a
readable diff are exactly the two that stayed.

**And one thing is given up outright.** Stealth existed so this could be used in a repository that is
not the operator's to change, which is where the two-layer model of FR-105 was aimed. Always-tracked
removes that, and the Azure DevOps case with it, until some later epic puts it back.

| # | Story | Why in that order |
|---|---|---|
| 1 | the image carries `bd` | FR-100, FR-101, FR-116, FR-121 — invisible to a project that does not opt in, and nothing below is verifiable without it |
| 2 | the work items move into the tracker | FR-117, FR-120 — every epic, story and task, closed ones included, and their files deleted |
| 3 | the board shows them | FR-118, FR-119 — the reading surface this epic exists for |
| 4 | the agent works from the tracker | FR-106 — what the normative documents say about taking the next item and closing it with a reason |
| 5 | the guard holds the split | FR-109 — that the documents which left do not come back, and the two that stayed do not start carrying state |
| 6 | the board reads like Azure DevOps | FR-118, amended on 2026-10-07 — cards by type, a backlog grid, an item form, and Azure DevOps's names, for reading before approving and for following progress equally |

**Story 3 is the one the operator asked for, and it is third on purpose.** A board over an empty
tracker shows nothing, and a board over a half-migrated one shows a project that does not exist.

**Two requirements changed again on 2026-10-05, after the reversal and before any code.** FR-103 is
struck: putting the tracker inside the repository made its sandbox grant redundant, because the
workspace is already mapped read-write and `bd` finds the database by walking up from it. And FR-116
now exports to a path of ours rather than tracking `.beads/`, because `bd init` writes that
directory's `.gitignore` itself and the Beads project ignores all of it.

**The second of those came from asking what the thing was for, again.** The requirement is *"se
precisar trocar de máquina ou baixar um repositório de novo, poder continuar de onde parou"* —
machine, not tooling. An earlier draft argued for rendered Markdown on the grounds that it survives
the tool disappearing, which nobody had asked for.

**Story 1 was already agreed once and has to be regrilled.** Its scenarios were written under
`--stealth` and under "nothing is written into the repository", and both are now false.
