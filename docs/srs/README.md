# Software Requirements Specification

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-10-01 |
| **Author** | João Lima |

What this system must do, agreed before any story is written. The purpose and the scope boundary
are [the charter](../CHARTER.md) and are not restated here.

A note on where things live, because this project is built across two repositories: the extension
is this one, and every change to the container image is the template's
(`jvsl.env.agents.code-server`). Requirements below are written about the **system the user
experiences**, which is both halves together. The epic section says which repository each story
lands in.

## The sections

Split from a single `SRS.md` on 2026-10-02, at 50863 of the 51200 bytes a Markdown file is allowed
here. Split on the section boundaries rather than on the byte count, and **nothing was compressed to
make it fit** — the length was the signal, and deleting the explanations that made it long is how a
requirement outlives its reason.

| | |
|---|---|
| [Functional requirements](functional-requirements.md) | FR-11 through FR-109, grouped by what they are about. The struck ones stay, annotated, because a requirement that was wrong is part of why the next one reads as it does |
| [Non-functional requirements](non-functional-requirements.md) | NFR-1 and the rest — what the system must be, rather than do |
| [Data and legal](data-and-legal.md) | what is processed, which is almost nothing, and the licence |
| [Epics and stories](epics-and-stories.md) | the four epics, their stories, and the order each is fixed in |
| [Alternatives considered](alternatives-considered.md) | what was weighed and rejected, with the reason — including the two reversed later |
| [Outcome](outcome.md) | acceptance, and the seven amendments. The record of every requirement that changed and why |
