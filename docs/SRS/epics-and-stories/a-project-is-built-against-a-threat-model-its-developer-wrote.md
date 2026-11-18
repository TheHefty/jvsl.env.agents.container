# Epic: a project is built against a threat model its developer wrote

**A project is built against a threat model its developer wrote.**

Agreed on 2026-11-18, from #362. The SRS carries what a project is built against — the data map,
the legal basis, the accessibility baseline — and nothing about what the system must be protected
from, so security entered a project as whatever the agent happened to think of. Asked to "make it
secure", an agent produces a catalogue, every class at the same weight; only someone who knows what
the system is for can say what is worth stealing, who would try, and by which door. The epic closes
when the SRS template carries a mandatory Security section, the story gate asks whether a story
changes it — in a project with a tracker, `refine-propose` requires the answer — and the *After the
code* checks answer against it. Tracked as `jvsl_env_agents_container-kr7`.

**Decided by João Lima before any story:**

- **The person writes the model and the accepted risks; the agent proposes the controls.** Controls
  are an options list under the same rules as any other: the simplest is always on it, and each
  states its cost and what would have to be true for it to be the right one.
- **The section is mandatory at the SRS gate.** A project with nothing worth defending says so in a
  line; it is never left empty in silence.
- **A project initialized before this is asked for it at its next story gate**, rather than left
  without one or migrated by the agent.
- **The tracker's story gate enforces the question.** `refine-propose story` refuses a story whose
  body does not say `Threat model: unchanged` or `Threat model: amended in <ref>`.
- **This is the application's threat model, not the environment's.** The template's own — keeping
  the agent off the host — stays where it is; two assets and two attackers, each in its own place.

| # | Story | Why in that order |
|---|---|---|
| 1 | the SRS carries the application's threat model | the section everything below reads |
| 2 | a story that changes the threat model amends it first | needs the section; the story gate's question |
| 3 | the After the code checks answer against the threat model | needs the section; checks 1 and 2 |
| 4 | the tracker's story gate asks about the threat model | needs story 2's question to enforce it |
