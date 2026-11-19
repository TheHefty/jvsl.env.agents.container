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

`contract.mjs` is the checker, and there is only one:

- **The agent** runs it in the container through `bin/idea-check <IDEA.md or idea folder>`. That
  prints one `<file>:<line>: <message>` line per problem (`<file>: <message>` when the problem is
  something missing) and exits 1, or exits 0 in silence.
- **The extension** bundles the same file (`src/ideas/contract.ts` re-exports it).

`examples/<name>/` holds an `IDEA.md` and an `expect.json`: whether it is valid, and, when it is not,
each problem with its line and a word the message must carry. Both sides are tested against every
one of them, so the two cannot disagree about what a valid idea is.
