# The study material's contract

A study topic is `docs/study/<slug>/guide.md`, built by the study skill and read in the extension's
Study view before the developer writes about it. The guide has seven sections, in this order:

```
## The problem
## Fundamentals
## What goes wrong without it
## How the project solves it
## Trade-offs
## Sources
## Points for the post
```

**A topic is its guide alone** since 2026-10-28 (task *the-practice-leaves-the-study*). Earlier
topics may still carry the files of the practice they had. Those are ignored, not refused, because
they are the developer's and nothing reads them any more.

## One checker, both sides

`validate.mjs` checks that the guide is there with its sections in order.

- **The study skill** runs it in the container through `bin/study-validate <topic-dir>`. That prints
  one `file: path: message` line per problem and exits 1, or exits 0 in silence.
- **The extension** bundles the same file for the Study view (`src/study/contract.ts`).

`example/bd-labels-are-null/` is a valid topic.
