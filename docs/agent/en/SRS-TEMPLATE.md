# Software Requirements Specification

| | |
|---|---|
| **Status** | Draft |
| **Date** | YYYY-MM-DD |
| **Author** | |

What the system must do, agreed with the user before any story is written — see
[Workflow](WORKFLOW.md). Requirements are stated so a person could hold the system to them, not so a
programmer could build from them: "a draft survives the browser being closed", not "call
`localStorage.setItem` on blur".

This is also the source of truth for how the work is decomposed. The epic-and-story section below is
what `docs/PLANNING/` mirrors; when the folder tree and this document disagree, this document is
right.

## Functional requirements

What the system does, grouped by area. Number them so a story and a task can cite the requirement
they implement. Each one is checkable: a reader can look at the running system and say whether it
holds.

For a **sustaining** engagement (see the charter's Kind), this section is hybrid: one line of
baseline for every area of the existing system — enough that a reader knows what is there and can
tell a regression from a change — and full detail only where the sustaining work reaches. The
baseline is reverse-engineered from the code that already runs; the detailed part is written the
same way it would be for a new project.

## Non-functional requirements

The constraints the functional requirements are delivered under — performance, availability,
accessibility, internationalization, operability. The accessibility and internationalization
baseline from [Initialization](INITIALIZATION.md) goes here, scoped honestly to what the project
actually has a surface for.

## Data and legal

The data map, carried over from initialization: what personal data exists, why, where it lives, the
legal basis for each use, how long it is kept, how a subject request is answered, and who the
controller is. **If nothing personal is processed, say so here** — that is the record that saves
the most work later. This is scaffolding, not legal advice; the job is to make the decisions
explicit for someone qualified to review.

## Security

What the system has to be protected from, and what was decided about it. **Required: the SRS is not
offered for agreement while any of the three parts below is missing**, and the gate names the part
that is — it is required before the SRS is agreed, not filled in once the code exists. A part with
nothing in it says so in a sentence ("nothing is accepted as a risk"), which is a decision; an
empty heading is not.

### Threat model

**Written by the user, in their words.** The agent asks; it does not answer for them. Three
questions, each answered concretely for this system:

- **What has value** — the data, the money, the access or the reputation someone could take or
  break.
- **Who would want it** — the people or programs with a reason to try, from a curious user to an
  automated scanner.
- **Through which entry** — every way in: the interfaces the system exposes, the dependencies it
  pulls, the people and machines that hold its credentials.

### Controls

**Proposed by the agent, as an options list, against the threat model above; the user chooses.**
For each threat, the menu has the shape [Modes](MODES.md) gives every trade-off: the simplest
control that could work is always on it, even when the agent would not recommend it, and each
option states its cost and what would have to be true for it to be the right one. Record what was
chosen and why; what was not chosen stays as one line, so the choice can be revisited.

### Accepted risks

**Written by the user.** What the chosen controls leave open, on purpose, and why that is
acceptable for now. A risk nobody wrote down here is not accepted; it is unseen.

## Epics and stories

The decomposition. One subsection per epic — a sentence saying what the epic is for, and the list
of stories it breaks into with a line each. This is the planning layer: an epic is the unit a
release is about ("Work has a theme" in [Rules](RULES.md)), a story is one unit of behaviour a
person cares about, and each story gets a folder under `docs/PLANNING/<epic>/<story>/` when it is
grilled.

Keep this section current as epics and stories are added — a new story adds a line here in the same
pull request that creates its folder.

## Alternatives considered

The shapes of the system that were on the table and lost, one line of "rejected because" each.
Include doing nothing.

## Outcome

Filled in when the status leaves `Draft`: what was decided, by whom, and what the grilling changed.
The original text stays as written; a later change of direction is a new grilling that amends this
document, noted here.
