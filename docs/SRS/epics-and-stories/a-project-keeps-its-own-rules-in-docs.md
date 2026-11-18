# Epic: a project keeps its own rules in docs

**A project's own rules live in `docs/RULES.md`, written by the agent beside the charter and the SRS.**

Agreed on 2026-10-15: nothing created `docs/RULES.md`, and the shipped `INITIALIZATION.md` and
`RULES.md` still described an import from `.code-server/docs/agent/` that no longer exists. The
agent writes it at initialization; Create writes nothing new.

| # | Story | Why in that order |
|---|---|---|
| 1 | the agent writes the project's rules | normative documents, both languages |
