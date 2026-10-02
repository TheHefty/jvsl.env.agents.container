---
status: Draft
story: the-extension-carries-the-image/the-bundle-carries-the-images-content
epic: the-extension-carries-the-image
pr:
---

# Task: the-package-carries-them-and-says-so

## Summary

`.vscodeignore` stops excluding `core/` and `stacks/` and starts excluding only their tests. Two
assertions hold the result in place, and they face opposite directions.

## Problem

Story 1 excluded both directories from the package deliberately — 132 KB nothing read. Story 3
reads them. This is the step between, and it is small: one file of patterns and the tests that make
the result a fact rather than an intention.

## Proposal

```
core/**/*.test.sh
stacks/**/*.test.sh
scripts/**
```

**No negation.** The probe in the story showed why: `!core/cont-init/**` after `core/**` re-admits
everything under that path, tests included, because later patterns win. Excluding only what must
not ship means there is no ordering to get wrong, and a stack added to `stacks/` travels without
anybody editing anything.

## The two assertions face opposite directions, and one of them does not exist yet

**`nothing ships that this test was not told to expect`** — written in story 1 — says what *may*
ship. It gains two entries, each with its reason.

**It cannot catch the opposite failure.** If `.vscodeignore` were wrong in the other direction —
`core/cont-init/**` excluded by accident — the allowlist would be perfectly happy: nothing
unexpected shipped. The package would simply be missing four boot hooks, and the first thing to
notice would be a container booting with no state-ownership repair, no git credential helper and no
`ai-memory`, saying nothing.

So the second assertion is **completeness**: every tracked file under `core/` and `stacks/` that is
not a test *is* in the package. Scenario 1 of the story is that, and it has no test today.

## Three worst failure scenarios

**1. The allowlist is satisfied by loosening it.** The obvious way to make it pass is a blanket
`^core/` entry, and then it says nothing about `core/` ever again — which is precisely what
happened to the blocklist it replaced, and the reason it was written as an allowlist. The entries
are two patterns with a reason each, and the completeness assertion is what makes a blanket entry
pointless anyway: it would still have to actually ship.

**2. The two assertions disagree about what a test is.** One decides what may ship, the other what
must. If they define `*.test.sh` differently — one matching only the top level, the other matching
nested — a file is simultaneously required and forbidden, and the cheapest way out is to edit
whichever one is complaining until it stops. **They derive the answer from one place**, and the
deadlock is the symptom that says they did not.

**3. A test ships because the glob is shallower than the tree.** `core/*.test.sh` misses
`core/cont-init/30-editor-leftovers.test.sh` and `core/bin/jail-wrappers.test.sh`. Sixteen files
across the two directories, and most of them are nested. This is the mistake the negation probe
already made once in a different form.

## Verification

| Test | Asserts |
|---|---|
| `tools/vsix.test.ts` — allowlist | gains `core/` and `stacks/`, each entry carrying its reason; an unlisted path still fails |
| `tools/vsix.test.ts` — completeness, new | every tracked non-test file under `core/` and `stacks/` is in the package, compared by path; red before the `.vscodeignore` change, at 57 missing |
| the same, for tests | **no** `*.test.sh` and nothing under `scripts/` is in the package |
| executable bits | a file that is `755` in the repository is `755` in the zip — measured already true, asserted so it stays |

**The completeness test is written first and is red at 57 missing files**, which is the whole
content of this task stated as a number.

## Blast radius

The package goes from 6 files to 63. Nothing reads the new ones, so nothing changes behaviour —
which also means **nothing would notice if they arrived corrupt**. The completeness assertion
compares paths rather than contents, and that limit is worth stating: the first thing that reads
these files is story 3, and it is what would find a damaged one.

## Alternatives considered

- **Keep excluding them and have story 3 read from the repository.** Rejected: it works for
  somebody developing the extension and fails for everybody who installs it, which is the worst
  distribution of a defect.
- **Ship a tarball of the two directories rather than the files.** Rejected: it buys nothing — the
  `.vsix` is already a zip — and it puts an unpacking step between the extension and files it could
  simply read.
- **A size budget on the package.** Rejected as arbitrary. What matters is whether a path should be
  there, which the allowlist already answers, and a number nobody set is a number somebody raises.

## Open questions

None.

## Outcome

Filled in when the status leaves `Draft`.
