# An idea's contract

An idea is `ideas/<slug>/IDEA.md` (epic 5kd, gh-364): a front matter, then four sections.

```
---
state: raw | exploring | ready | discarded | became project: <name>
stacks:
  <name>: <version, or undecided>
---

## Purpose and who it is for
## Decisions and discarded alternatives
## Stack
## Open questions
```

The front matter is a **strict subset, not YAML**: `state:` and an optional one-level `stacks:` map,
nothing else. Anything outside it is refused, naming its line. An idea may lack sections while it is
being shaped; a `ready` one has all four, each with something in it.

## One set of examples, both sides

`examples/<name>/` holds an `IDEA.md` and an `expect.json`: whether it is valid, and, when it is not,
each problem with its line and a word the message must carry. The extension's checker
(`src/ideas/contract.ts`) is tested against every one of them, and the plugin's own checker is held
to the same files, so the two cannot disagree about what a valid idea is.
