# Task: the rules say how a proposal is made and agreed

| | |
|---|---|
| **Story** | `the-agent-works-from-the-tracker` |
| **Date** | 2026-10-06 |
| **Depends on** | `the-rules-say-how-to-work-from-the-tracker` (shipped in #120) |

## Summary

The rule "a link is created after it is agreed, never before" is replaced by the proposal's whole
cycle: a draft is created as a `proposed` item that is deferred, it becomes work only after the
operator agrees it, and a rejection closes it with its reason. Both languages, and the guard that
holds the rules to the story's scenarios. FR-106 as amended on 2026-10-06.

## Problem

The rules shipped in #120 tell the agent to draft in the conversation and create an item only after
agreement. FR-106 now says the opposite, so that the board can show a draft before the operator
answers. Every project that bumps receives rules that contradict the requirement they implement.

## Proposal

One bullet in "The work tracker" becomes three, in both languages. Every command was run against
bd v1.3.1 on 2026-10-06:

| Step | The agent | Command |
|---|---|---|
| a draft | records it as a proposal, under its parent | `bd create --labels proposed --status deferred --parent <id>` |
| the operator agrees it | makes it work, **both in one step** | `bd undefer <id>` and `bd label remove <id> proposed` |
| the operator rejects it | closes it with the reason, never deletes it | `bd close <id> --reason "…"` |

"`bd ready` informs; it does not authorise" gains one sentence: a proposal is never reported as
work, and nothing is started under it.

## Three worst failure scenarios

| # | Scenario | How it manifests | Test that catches it |
|---|---|---|---|
| 1 | **A proposal is created as work.** The rule names `--labels proposed` without `--status deferred`, or the two drift apart | the draft appears in `bd ready`, and an agent in another session starts it before anyone agreed it | the guard requires `bd create --labels proposed --status deferred` as one command, in both languages. The image test already runs every named command's flags against the pinned bd |
| 2 | **Agreement is done by halves.** Undeferred but still labelled, or relabelled but still deferred | the board shows agreed work as a proposal, or agreed work never reaches `bd ready` | the guard requires `bd undefer` and `bd label remove … proposed` in the same bullet, so the rule cannot state one without the other |
| 3 | **A rejected proposal is deleted.** `bd delete` exists, and a rule naming it would erase why something was not done | the reason for a rejection is gone, and the same draft comes back a month later | the guard refuses `bd delete` anywhere in the normative documents |

## Blast radius

`docs/agent/{en,pt-BR}/RULES.md` and `scripts/tracker-rules-are-conditional.test.sh`. The rules ship to
every project, so the change is `feat`.

## Alternatives considered

None that the operator had not already decided: drafts as proposals is FR-106's amendment, and the
commands are the ones measured.

## Verification

The guard in `ci-scripts`, and the image test's check of every named command against the pinned bd.
Whether an agent follows the cycle is the story's `@manual` scenarios.

## Open questions

None.

## Outcome

Filled in when the task closes.
