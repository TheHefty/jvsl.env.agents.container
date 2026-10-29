---
name: study
description: Build study material for a topic the developer wants to understand before writing about it — a guide in docs/study/<slug>/, tracked as a study task. Use when the developer asks to study a topic, to turn a blog candidate or a report topic into study material, or to prepare before writing a post. Never writes the post.
---

# Study material

Writing about what the agent discovered, without studying it first, publishes knowledge that is not yours. This skill builds the material the developer studies, in the extension's Study view, **before** they write. **It never writes the post.**

## 1. The tracker has to be on

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/needs-tracker
```

If it exits non-zero, tell the developer the line it printed, word for word, and stop.

## 2. Choose the topic

Run, from the project's root:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/study-sources
```

It lists the discoveries the retro marked as blog candidates, and the topics in `docs/REPORT.md`, each with its slug. The developer chooses one, or describes their own topic. For their own, make the slug with:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/study-slug "<title>"
```

## 3. Before writing anything

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/report-guard start
```

## 4. Research

Research the topic in the project's code, its documents, its history (`git log`, the journal, the pull requests), and in **primary sources**: the official documentation, the specification, the library's own source. Didactic, but not shallow: explain the mechanism, not only the result.

## 5. Write the material in `docs/study/<slug>/`

**`guide.md`** is the material, and the whole of it. It has seven sections, with the headings exactly as the contract names them, and the prose in the project's documentation language:

```
## The problem
## Fundamentals
## What goes wrong without it
## How the project solves it
## Trade-offs
## Sources
## Points for the post
```

- Every reference to the project cites **file and line**.
- In Trade-offs, keep three things apart: decisions that were recorded, decisions that are implicit, and what the agent discovered.
- Library behaviour you could not confirm is marked `(inference)`, with where to check it.
- Write it to be studied, not skimmed: the mechanism, worked through, so the developer can explain it in their own words before writing about it.

## 6. Check it

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/study-validate docs/study/<slug>
```

Fix every line it names until it is silent.

## 7. Track it

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/study-track <slug> "<title>"
```

It creates the topic's task once, or updates a rebuilt one without touching its status.

## 8. Prove nothing else was written

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/report-guard end docs/study/<slug>/
```

If it fails, tell the developer exactly what changed. A post, or any other file, is not this skill's to write.

## 9. Hand over

Tell the developer the topic is ready to study in the Study view, and name the task's id.
