# Epic: the agent's code is looked at in the cheap moment and after it exists

**The agent's code is looked at in the cheap moment, before it is written, and after it exists.**

Agreed on 2026-10-21, from #184 and #185. Every gate in the chain is pre-code. Nothing asked for the
generated code to be looked at afterwards, and the decisions a task did not fix were made silently
during implementation and surfaced only as a diff. The epic closes when the task template carries
checks answered against the diff and the mode's pre-code step states the implementation's shape,
in both languages. Tracked as `jvsl_env_agents_container-cig`.

| # | Story | Why in that order |
|---|---|---|
| 1 | the task records five checks against the diff after the code | #184; one section in the template, the safety net |
| 2 | the agent states the implementation's shape before writing it | #185; extends the mode's pre-code step rather than adding a second one (decided 2026-10-22) |
