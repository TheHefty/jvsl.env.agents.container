# Epic: an SRS change is agreed knowing what it does to the charter's deadline and hours

**An SRS change is agreed knowing what it does to the charter's deadline and hours.**

Proposed on 2026-11-26 by João Lima, at the refinement of that day. The charter says what a project
is for and what it will not do, and nothing about when it should be done or how much of the
developer's time it takes. So every SRS change — a new epic, a story nobody saw — is agreed without
anyone saying what it costs against either, and a project grows by amendments that were each cheap
to agree and together are not what was chartered.

**Decided by João Lima before any story** (the grilling of 2026-11-26):

- **The charter records a deadline and the developer's hours.** The deadline is an estimated
  duration and the date it gives; the hours are the developer's own effort, estimated. Not money:
  infrastructure and API spend are out of this epic.
- **New projects only.** The charter template and the initialization ask for both. A project
  chartered before the rule adds them at its next charter amendment, and is not migrated by the
  agent.
- **Every SRS amendment for an epic says what it does to them, before it is agreed.** A section
  *Deadline and hours* states the effect, or `none`, with why. Absent or empty is not `none`: as with
  the threat model, silence cannot be told apart from forgetting.
- **An amendment that overruns the charter waits for the charter.** When it would take the project
  past its deadline or its hours, the charter is amended first, at its own gate, and the epic is
  agreed after.
- **The tracker enforces the question** for epics agreed after the rule lands, as `refine-propose`
  does for the threat model. Epics agreed before it are not refused.

**Deadline and hours:** none — this repository's charter predates the rule and records neither, and
the rule applies to projects chartered after it.

Threat model: unchanged — documents, and a refusal in the tracker's own scripts; nothing reaches a
new surface.

| # | Story | Why in that order |
|---|---|---|
| 1 | a new project's charter records its deadline and the developer's hours | the numbers everything below is measured against |
| 2 | an SRS amendment says what it does to the deadline and hours before it is agreed | needs the numbers; the rule, in both languages |
| 3 | the tracker refuses a story of an epic whose amendment does not answer it | needs story 2's section to enforce it |

## Story 1: a new project's charter records its deadline and the developer's hours

`CHARTER-TEMPLATE.md` and `INITIALIZATION.md`, both languages: the charter gains a section with the
deadline, as an estimated duration and the date it gives, and the developer's hours, estimated. The
initialization asks for both at the charter gate; a project chartered before keeps its charter until
its next amendment. Threat model: unchanged — a document's sections.

```gherkin
Scenario: a new charter carries the deadline and the hours
  Given a project being initialized
  When the charter is written at its gate
  Then it states the estimated duration, the date it gives, and the developer's estimated hours

Scenario: an older charter is not migrated
  Given a project chartered before the rule
  When nothing amends its charter
  Then its charter is left as it is
  And its next charter amendment adds the deadline and the hours
```

## Story 2: an SRS amendment says what it does to the deadline and hours before it is agreed

`RULES.md`, `WORKFLOW.md` and `SRS-TEMPLATE.md`, both languages: every epic's amendment carries a
*Deadline and hours* section — the effect, or `none` with why — written before the SRS gate; an
amendment that would overrun the charter waits for the charter to be amended at its own gate. A
guard fails when either language loses the section or the overrun rule. Threat model: unchanged — a
rule and a document's section.

```gherkin
Scenario: an amendment states its effect before it is agreed
  Given a new epic proposed at the SRS gate
  When its amendment is written
  Then it says what the epic does to the charter's deadline and hours, or none with why

Scenario: an amendment that overruns the charter waits for it
  Given an epic whose amendment would take the project past its deadline
  When it is brought to the SRS gate
  Then the charter is amended first, at its own gate
  And the epic is agreed after
```

## Story 3: the tracker refuses a story of an epic whose amendment does not answer it

`refine-propose story` refuses a story whose epic was agreed after the rule landed and does not say
`Deadline and hours: none — <why>` or `Deadline and hours: <effect>`, naming the epic and what is
missing; an epic agreed before the rule is not refused. Threat model: unchanged — a refusal in the
tracker's own scripts.

```gherkin
Scenario: a story under an epic that does not answer is refused
  Given an epic agreed after the rule, with no deadline-and-hours answer
  When a story is proposed under it
  Then the proposal is refused, naming the epic and the missing answer

Scenario: an epic agreed before the rule is not refused
  Given an epic agreed before the rule landed
  When a story is proposed under it
  Then the proposal is accepted as before
```
