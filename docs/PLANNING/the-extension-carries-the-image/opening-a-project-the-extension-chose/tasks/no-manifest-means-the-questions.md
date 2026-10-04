---
status: Done
story: the-extension-carries-the-image/opening-a-project-the-extension-chose
epic: the-extension-carries-the-image
pr: 71
---

# Task: no-manifest-means-the-questions

## Summary

A chosen folder with no manifest is asked about rather than refused, and the answers carry straight
on into the build. The story's third scenario, and what closes it.

## What the first task left, deliberately

`decidePick` refuses a folder with no manifest, naming the file and pointing at the configure
command. That was the right temporary answer — *"a picker that accepts anything and then does
nothing is worse than one that refuses, because the person believes it started"* — and it is the
thing this task replaces.

## The measurement that shapes it

**`configure` cannot be asked about a folder that is not open.** Measured:

```ts
const folder = vscode.workspace.workspaceFolders?.[0]
if (!folder) {
  void vscode.window.showErrorMessage('Open a project folder first.')
  return
}
```

It reads the workspace rather than taking a root, so the questions are only askable about the
project already open — and the whole point here is to ask about one that is not. **That signature
change is most of the task.**

**And it says nothing about what it did.** It returns `void`, with an early `return` at each
cancellation point. So a caller cannot tell "the person answered and a manifest was written" from
"the person pressed Escape at question three" — and the two have to lead to different places.

**What it already gets right**: nothing partial is written. Every cancellation returns before
`nextManifest`, so a half-answered run leaves no half-written manifest. That is one failure
scenario this task does not have to carry.

## Three worst failure scenarios

**1. The questions are asked about the wrong folder.** If `configure` keeps reading the workspace
while the caller passes a different root, somebody configures the project they *had open* instead of
the one they chose — **rewriting `.code-server.stack.json` in a repository nobody asked about.** That
file is tracked, and it is the only record of what a project selected. This is the one with a cost
that is not recoverable by trying again.

**2. Cancelling the questions still builds, or still opens.** Five steps, and Escape at any of them
means the person decided not to. Proceeding from there builds an image for a project with no
manifest — core alone, which is a working image and the wrong one — and then attaches somebody to
it.

**3. The manifest is written and the flow stops.** Somebody chose a folder, answered five questions,
and has to invoke the open again to get anywhere. **The least obvious of the three**, because
nothing failed: it asked, it wrote, and then it looked like it forgot. The chain is no manifest →
ask → write → build → open, and this task owns the middle of it.

## Verification

| Test | Asserts |
|---|---|
| a new unit test | the questions' root is the one passed in, never the workspace's |
| the same | a cancelled run reports that nothing was written, and a completed one reports what it wrote |
| `pick.test.ts` | a folder with no manifest no longer decides `refuse` — it decides `configure` |
| the same | the decision still names the folder, so the output channel says which project is being asked about |

**The first is the one worth the most and the cheapest to write**, because `configure`'s root
becoming a parameter is exactly the kind of change that works in the window where it was tested and
writes into the wrong repository everywhere else.

## Out of scope

- **Asking about a folder that is not a git repository, or is empty** — story 7 scaffolds a new
  project, and this task is about adopting a folder that already has something in it.
- **The panel** — story 8. The entry stays a command.

## Outcome

Implemented in #71. 134 unit tests, 11 bundle, typecheck clean.

**There were eight cancellation points, not the five the design implied.** Every `return` in
`configure` had to carry `{ wrote: false }` — the five questions, plus the no-stacks refusal, the
unreadable-manifest refusal, and the missing-dependency refusal. The design counted the questions and
not the refusals, and a caller cannot tell one kind of early exit from another.

**Two decisions the design did not name.** The `configure` variant carries `newWindow` too, because a
window with somebody's work in it is still theirs after five questions. And `configure` does **not**
build when a root was passed: the caller is driving a longer sequence and will build the folder it
chose, so building here would be seven minutes on a cache hit nobody is watching.

**And the task found a defect in the previous one, which CI had already caught.** `git add -- src`
staged the source for #69 and left the integration fixture's matching edit uncommitted in the working
tree — where it followed me into this branch and broke typecheck here too. #69 was at
`typecheck=FAILURE` for exactly that. **Staging by directory is what hid it**; `git status` would have
said so, and reading it is now the step rather than an afterthought.
