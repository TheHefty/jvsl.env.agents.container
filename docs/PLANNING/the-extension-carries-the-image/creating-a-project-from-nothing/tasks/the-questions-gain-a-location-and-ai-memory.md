---
status: Done
story: the-extension-carries-the-image/creating-a-project-from-nothing
epic: the-extension-carries-the-image
pr: 77
---

# Task: the-questions-gain-a-location-and-ai-memory

## Summary

Two more answers: where the project goes, and whether it carries `.ai-memory.toml`. FR-90's first
half, before anything is written anywhere.

## What the questions carry today

```ts
export interface Answers {
  stacks: Record<string, string>
  limits: { memory: string; memorySwap?: string; cpus?: number }
}
```

Stacks and limits, and nothing about *where*. That is correct for configuring a project that is
already open — the location is the folder the questions were asked about. **Creating one has no
such folder**, which is why this is a task rather than a parameter.

## The ai-memory answer is a decision, not a preference

The marker is the switch, and the image's own hook reads it:

```sh
MARKER="${AI_MEMORY_MARKER:-/config/workspace/.ai-memory.toml}"
[ -f "$MARKER" ] || exit 0
```

**Without the file nothing listens**, no lifecycle event is emitted, and the agent's sandbox is not
widened to reach the store. With it, prompts and tool excerpts are captured to disk — per project,
with no LLM provider configured, so nothing leaves the machine.

So the question is not "do you want a feature". It is **"should this project record what the agent
was told"**, and the answer belongs to whoever creates the project rather than to a default. The
inherited rules say it is off until a project asks; a creation flow that wrote the marker silently
would be the project asking on somebody's behalf.

## Three worst failure scenarios

**1. The location question accepts a directory that is somebody's work.** This task only *asks*; the
next one writes. But an answer that cannot be refused later is an answer that wasted five more
questions — so the location is validated when it is given, not when it is used. **Empty, or not
there yet, and nothing else.** A directory with files in it is refused at the point somebody can
still choose differently.

**2. The marker is written with content that stops meaning anything.** The file is not a flag; it is
TOML the service reads, and this repository's own carries seven lines of comment explaining why it
exists. A zero-byte file would switch memory on and tell the next reader nothing about why. What the
creation flow writes has to say what it is for, the way this repository's does.

**3. The questions are asked in an order that wastes them.** Five existing questions plus two:
asking the stacks first and the location last means somebody who chose an impossible directory
answers six questions before being told. **Location first**, because it is the only answer that can
be refused outright.

## Verification

| Test | Asserts |
|---|---|
| `questions.test.ts` | `Answers` carries a location and the ai-memory choice, and `nextManifest` ignores both — they are not manifest fields |
| the same | a location that is a file, or a directory with anything in it, is rejected; an absent path and an empty directory are accepted |
| a new test | the marker's content names what it switches on, rather than being empty |
| `pick.test.ts` | unchanged — this task adds no decision to the picker |

**The second is the one worth the most**, because the location is the answer whose being wrong costs
the most later: scaffolding into a directory that has something in it is the destructive case story 7
exists to refuse.

## Out of scope

- **Writing anything** — the next task. This one asks and validates.
- **`git init`** — the next task too, and it is where the refusal is enforced a second time, because
  a directory can gain files between the question and the write.

## Outcome

Implemented in #77. 149 unit tests, typecheck clean.

**The red state for the two fields was in typecheck, not in the test run**, because `node --test`
strips types. A test naming a field that does not exist passes until `npm run typecheck` says
otherwise — which is why that command exists separately, and which is worth knowing as the shape
red-first takes in this repository.

**One case the design did not name: a dotfile counts.** A directory holding only `.git` is a
repository, and it is the one that most looks empty. `readdirSync` sees it; a check written with a
glob would not.

**And what was found is named rather than counted.** "3 entries" tells somebody nothing about
whether they chose the wrong directory or the right one twice, so the refusal lists up to three by
name. A path that is a *file* gets a different sentence from one that is occupied, because the fix
is different: one needs another path, the other needs an empty one.

The refusal is asserted not to read as a defect — `error`, `failed`, `broken` and `invalid` are
forbidden in it. A directory somebody is using is not a fault.

**The marker's content was the design's second scenario and it grew while being written.** It
carries what ai-memory costs and that deleting the file switches it off, as well as what it switches
on. The next reader of that file is somebody deciding whether to keep it, and a zero-byte flag tells
them nothing.
