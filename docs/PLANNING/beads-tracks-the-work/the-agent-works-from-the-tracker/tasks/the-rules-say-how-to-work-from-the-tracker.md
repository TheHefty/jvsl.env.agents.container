# Task: the rules say how to work from the tracker

| | |
|---|---|
| **Story** | `the-agent-works-from-the-tracker` |
| **Date** | 2026-10-06 |
| **Depends on** | `initialising-leaves-the-repository-alone` (shipped), which wrote the subsection this extends |

## Summary

The "The work tracker" subsection of the inherited rules, in English and Portuguese, says how an
agent reads, records and closes work in a project that has a tracker. The "Debts" section of the
workflow gains the tracker's form of a debt. A test against the image's real `bd` holds every
command the rules name to the pinned version. FR-106 and FR-117 as amended on 2026-10-06.

## Problem

The tracker exists in a project that opts in, and nothing tells the agent how to use it. The tool's
own instructions, which `bd init` would install, were removed in #117 because they contradict this
epic. Without a replacement the agent has three bad choices: ignore the tracker, guess at it, or
follow the general habits of tracker tools, which create items freely.

## Proposal

**The rules, in "The work tracker"**, after the two bullets already there. Every command was run
against bd v1.3.1 on 2026-10-06:

| When | The agent | Command |
|---|---|---|
| asked what to do next | reports what has no open blocker, and **does not start it** | `bd ready` |
| starting work the operator has agreed to | marks it in progress, with itself as the owner | `bd update <id> --claim` |
| the change that finishes it is merged | closes it, saying what finished it | `bd close <id> --reason "…"` |
| a link of the chain is agreed | creates its item, with the agreed text | `bd create … --parent <id>` |
| it finds a problem outside its work | **asks**, and only after a yes records a debt labelled `defect` | `bd create … --type bug --labels defect` |

**What is not in the tracker until it is agreed.** A draft of an epic, story or task lives in the
conversation, and its item is created after the operator's yes. The tracker holds only what passed
a gate. Decided by the operator on 2026-10-06, over a `deferred` item labelled `proposed`, which
would have shown drafts on a board at the cost of items existing before their gate.

**A closing reason is required by the rules, not by the tool.** Measured: `bd close` without
`--reason` succeeds and records only "Closed". Nothing in the tool prevents it.

**The workflow's "Debts" section** gains the tracker's form: with a tracker, a debt is a `bug` item
with the template's sections and exactly one of `hotfix`, `shortcut` or `defect`, and
`docs/DEBTS/` is not used. Without a tracker, nothing changes.

**Both documents keep the condition up front.** Each passage starts with "in a project that has a
tracker", because most projects never opt in and a rule that assumes a tracker is false for them.

## Three worst failure scenarios

| # | Scenario | How it manifests | Test that catches it |
|---|---|---|---|
| 1 | **The rules name a command the pinned bd does not have.** A bump renames a flag, or the rules were written from the documentation rather than the binary | the agent's command fails mid-session, and it improvises a different one | `core/image.test.sh` reads every `` `bd …` `` the tracker subsection names, in both languages, and runs it with `--help` against the image's own `bd`. An unknown command or flag fails the build |
| 2 | **A project without a tracker reads the rules as its own.** A tracker rule escapes its condition | the agent runs `bd` where there is no `.beads/`, or "fixes" the error with `bd init`, which writes into the repository | `scripts/tracker-rules-are-conditional.test.sh`: in both languages, no `bd` command appears in the normative documents outside a passage that opens with the condition |
| 3 | **English and Portuguese say different things.** The parity check compares files, headings and links, not meaning | an agent working in one language follows a rule the other does not have | the same guard compares the set of `bd` commands each language names, which must be identical. Meaning beyond that is reviewed in the pull request, which says so |

## Blast radius

- **`docs/agent/{en,pt-BR}/RULES.md`** and **`docs/agent/{en,pt-BR}/WORKFLOW.md`**. They ship to
  every project, so the change is `feat`, not `docs`. A project without a tracker reads one more
  conditional subsection and nothing else.
- **`core/image.test.sh`**, one more assertion against the built image.
- **A new guard** in `scripts/`, with its job in `ci-scripts`.

## Alternatives considered

- **Install `bd prime`'s output, or bd's `AGENTS.md` block**, as the instructions. Declined in #117:
  it tells every session to create items before writing code and to use `bd remember`.
- **Drafts as `deferred` items labelled `proposed`.** Declined by the operator; see the proposal.
- **Record found problems without asking** (as `bug` items), **or never record them.** The operator
  chose to be asked every time.

## Verification

- The image test (scenario 1) and the new guard (scenarios 2 and 3) in CI.
- **Not reachable by any test:** whether an agent follows the rules. That is the story's two
  `@manual` scenarios, observed over a real session.

## Open questions

None. Where drafts live, how found problems are recorded, and that debts are labelled by kind were
settled by the operator on 2026-10-06.

## Outcome

Filled in when the task closes.
