# Story: The configuration declares no editor's variable

| | |
|---|---|
| **Status** | Draft |
| **Epic** | `the-image-stops-being-code-servers` |
| **Date** | 2026-10-02 |

## Summary

`PASSWORD` leaves the generated configuration, and the template version this extension says it needs
becomes true and starts being enforced.

It delivers **FR-74** of the SRS.

## Why it is not one line

FR-74 is one line: `containerEnv` declares `PASSWORD: ''` so that code-server would not demand a
password, and there is no code-server. `PUID` and `PGID` stay — those are the base image's, not the
editor's.

**But writing the story found a declaration that has been wrong since `v2.3.0`.** `package.json`
says:

```json
"templateMinVersion": "2.2.0"
```

and the extension has depended on `2.3.0` features ever since: the `devcontainer.metadata` label
carrying extensions, and `.vscode`/`.devcontainer` being read-only to the agent. **Nothing noticed**,
because the number is reported in the diagnostics output and read by nothing else — no path in
`open.ts` consults it.

So a project on an older template opens, succeeds, and delivers an editor with no extensions at all,
with nothing saying why. That is the failure this story closes, and it is larger than the one it was
written for.

## What this story does

1. **`PASSWORD` goes** from `containerEnv`.
2. **`templateMinVersion` becomes the version that removes the editor** — whichever number
   release-please gives that release, filled in by the task rather than guessed here.
3. **`open.ts` refuses a template below it**, naming the cause, the way it already refuses a
   configuration somebody else wrote and a running launcher.

**Two refusals, not one, and the distinction already exists in this repository.** `diagnostics.ts`
carries it in its own words:

> **An unreadable template version is not an old one.** Saying "too old" for a file that could not be
> read sends the reader to bump a submodule that is missing entirely.

A missing `.code-server/version.txt` means the submodule was never initialised; an old number means
it needs bumping. They are different sentences and different fixes, and collapsing them is the
failure that comment was written against.

**Where the refusal goes in the order.** After the check that the Dev Containers command exists —
without that nothing works at all — and before the running-launcher one. A too-old template is a
wrong arrangement rather than a transient condition, so it is worth saying before anything about
what happens to be running.

## What is deliberately left alone

**The refusal about a running `<repo>-app`.** That container was the deleted launcher's, and the
launcher being gone from the template does not remove it from somebody's machine: a container
created by an old build can still be running, and two containers over one `/config` volume is two
nested daemons and two ai-memory servers writing one store. The wording already says "this project's
old launcher", which is now simply accurate.

## Acceptance criteria

[`the-configuration-declares-no-editors-variable.feature`](the-configuration-declares-no-editors-variable.feature),
beside this file. Agreed at the story gate, before any task is written.

No scenario is `@manual`. Everything here is a decision made by a pure function over what the host
looks like — which is the shape this repository's code already has, and why `decideOpen` returns a
decision rather than performing one.

## Tasks

| Order | Task | Repo | Status |
|---|---|---|---|
| 1 | `tasks/the-minimum-template-version-is-true-and-enforced.md` | extension | not yet written |

One task. The variable and the version are the same change: both are statements about which template
this extension works against, and splitting them would ship a configuration that stopped declaring
`PASSWORD` while still claiming to work with the template that needed it.

**It cannot be implemented until the template releases the version that removes the editor**, because
the number has to be real. That is a dependency on another repository's release rather than on work,
and the task records it.

## Out of scope

- **Anything about the image.** Stories 1, 2 and 4, in the template.
- **Making `templateMinVersion` verifiable.** Nothing can check that the declared minimum matches
  what the extension actually uses — the discovery above is a person reading two repositories. It is
  worth a debt rather than a mechanism, and the task says so rather than inventing one.
