---
name: project-report
description: A read-only report on the project — overview, decisions documented and implicit, critical areas, quality and tests, a study list by risk, and topics worth writing about — written to docs/REPORT.md, which git ignores. Use when the developer asks for a project report, an overview of the codebase, what to study, or what is worth writing about.
---

# The project report

A snapshot of the project, for the developer to read and to study from. It is one of the two sources of study topics, beside the journal's blog candidates.

**It changes nothing but `docs/REPORT.md`.**
- Read files and git history only.
- Never build, test, install, format, or start a container.
- Never edit a file of the project, not even to fix something you find. Put what you find in the report instead.

## 1. Before anything

Run, from the project's root:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/report-guard start
```

## 2. Read the project

Read what the project is and what it does: its documents, its code, its tests, its history (`git log`), and how it is configured and deployed. **Every claim you will write needs a file to cite.**

## 3. Write `docs/REPORT.md`, in exactly this shape

```
# Project report
## Overview
## Decisions
### Documented
- <decision> — Source: `<path>` — Reason: <as the source gives it>
### Implicit
- <decision> — In: `<path>` — Alternatives: <…> — Cost of change: <…>
## Critical areas
## Quality and tests
## Study list
## Topics to write about
- <topic> — Files: `<path>`, `<path>`
```

- **Overview**: purpose, user flows from the code, a module map, and Mermaid diagrams where they help.
- **Decisions**: a decision whose reason is written somewhere is **documented**, with its source. One in the code with no recorded reason is **implicit**: it gets its alternatives and the cost of changing it, and **never a reason**. Do not invent motives.
- **Critical areas**: authentication, personal data and privacy, persistence, external integrations, configuration and secrets, deploy and recovery.
- **Quality and tests**: coverage by module, untested critical paths (including the wiring between components), inconsistencies, and stale documents.
- **Study list**: what the developer should understand first, by risk.
- **Topics to write about**: each with the files it rests on, so the study skill can start from them.

**Every item cites a file in backticks** (`path`, or `path:line`). A claim you could not confirm in a file ends with `(inference)`.

## 4. Check it

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/report-exclude
${CLAUDE_PLUGIN_ROOT}/bin/report-check docs/REPORT.md
```

`report-exclude` keeps the report out of git through `.git/info/exclude`, which changes no file of the project. Fix every line `report-check` names, and run it again until it is silent.

## 5. Prove nothing else changed

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/report-guard end
```

If it fails, tell the developer exactly what changed. Do not undo it quietly, and do not hide it.

## 6. Hand over

Tell the developer the report is at `docs/REPORT.md`, name its three most important findings, and say that its topics can be built into study material.
