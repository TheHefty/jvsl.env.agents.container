# Epic: the agents screen

**Connecting an agent is a thing you do once, in one place, and can see the state of.**

**No requirements are written for it in the SRS yet**, and that is deliberate: an FR is a thing
agreed at a gate, and this epic has not been through one. The SRS names it in *Epics named but not
decomposed* and points here.

## Status: named and decomposed, and NOT grilled

The SRS says of this list: *"None has stories until it is grilled."* This epic has stories because
they were asked for, and **it has not been grilled.** What that costs is specific rather than
procedural: every story in the epic before this one changed shape when it was measured, and the one
thing this epic turns on — where a credential lives and how it crosses a boundary — is the subject
on which this project has already been wrong once in production.

Treat what follows as a proposal to grill, not as an agreed decomposition. **No `.feature` file is
written for a story here**, deliberately: scenarios are what the story gate agrees, and writing
them before the grilling would make the grilling about editing my sentences rather than about the
design.

## The problem

Two agents ship in the image — the Claude Code CLI and the Codex CLI — and connecting either is
currently something a person does by hand, inside the container, once per rebuild if they are
unlucky. There is no way to see which are connected, no way to renew one deliberately, and the
answer to *where does this credential live* is different for each.

## What makes it hard, and it is not the UI

**The charter's rule is absolute and this epic is where it bites.** A credential reaches the agent
as a *file*, never as a variable:

> A variable passed into the sandbox is re-expanded onto the sandbox launcher's own command line,
> and that launcher runs in the container's process namespace — so the value is readable with `ps`
> from anywhere else in the container, including a build and anything that build runs. This is not
> a hypothetical: a GitHub token was found that way in a running environment, under a comment
> asserting it could not happen.

**And one agent already breaks it.** `OPENAI_API_KEY` still crosses as a variable; the debt
[`forwarded-secrets-land-in-the-sandbox-argv`](../DEBTS/forwarded-secrets-land-in-the-sandbox-argv/)
owns it. A screen that offers to connect Codex while that is true is a screen that makes an
existing hole easier to reach.

## Stories, as a proposal

| # | Story | Why in that order |
|---|---|---|
| 1 | the screen says what is connected | read-only, and it is what makes the rest observable |
| 2 | Codex stops crossing as a variable | the debt. Nothing should offer to connect an agent whose credential is readable with `ps` |
| 3 | connecting an agent from the screen | needs 2, or it ships the hole behind a button |
| 4 | renewing without rebuilding | the one that decides whether this is worth having |

**Story 2 before story 3 is the whole shape of this epic.** The attractive order is to build the
screen first and fix the credential later, and it is wrong: a button that connects Codex is a
button that writes a secret somewhere, and the place it writes to is the thing that is broken.

## What this epic must not do

- **Keep a credential anywhere this repository can read.** Not in the manifest, not in the
  generated configuration, not in extension state. The screen says *whether* something is
  connected; it never holds *what*.
- **Print or echo a credential**, including into a log line, a notification, or an error that
  quotes what it received.
- **Write a secret to a file for a person to copy.** If a value has to reach a person, it reaches
  them from the tool that issued it.

## Outcome

Open. Not started, and not startable before the epic above closes.
