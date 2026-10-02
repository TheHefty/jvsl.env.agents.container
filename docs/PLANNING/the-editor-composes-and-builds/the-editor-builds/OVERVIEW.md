# Story: The editor builds

| | |
|---|---|
| **Status** | Draft |
| **Epic** | `the-editor-composes-and-builds` |
| **Date** | 2026-10-02 |

## Summary

The build runs from the editor, in a terminal, with `setup` as the terminal's own process. The host
checks `init` performed move here, and `init` and `packages.sh` are deleted from the template.

## Why

It delivers **FR-64**, **FR-66** and **FR-67**, and closes the epic: after it, selecting stacks and
building happen in the editor and nothing needs `whiptail` or `init`.

## What this story does

**A terminal whose process is `setup`.** Not a shell with a command typed into it: `sendText` leaves
the command as editable text, gives no exit code, and depends on quoting a path correctly. The
terminal's `exitStatus` is what says whether the build worked, and closing the terminal is the
cancellation.

**Standard input is redirected, and this is the part the gate's answer did not account for.**
`createTerminal` runs its process in a pty, so `[ -t 0 ]` is **true** — and story 1 made that the
thing `setup` uses to decide whether to ask. Without a redirect the build would stop on questions the
editor had already asked.

There is no stdin option on `createTerminal`, so the process is `/bin/sh` with exactly one job:

```
shellPath: '/bin/sh'
shellArgs: ['-c', 'exec "$0" </dev/null', setupPath]
```

**That is a shell in the path and it is not the thing `sendText` was rejected for.** Nothing is
typed, nothing is editable, and the script's path arrives as `$0` rather than interpolated into a
command line — so a directory with a space in it is not a quoting problem. What a shell buys here is
the one redirect that the editor's API does not expose.

**The host checks run before the build and on activation.** `jq` present, `docker` present, `docker`
usable by this user — each naming the package for this distribution's manager, which is what `init`
existed for. On activation they feed the view, so "docker is installed but not usable by this user"
is visible before anybody clicks anything.

**On activation they are bounded and may answer "unknown".** `docker info` hangs when the daemon is
unreachable rather than failing, and an activation that hangs is a window opening slowly with nothing
saying why. A short timeout, and an expired check reports unknown rather than bad: being wrong about
the host in the direction of "I could not tell" is the only acceptable direction on a path nobody
asked for.

**The package-name table moves to the extension and the shell copy is deleted.** `packages.sh`, its
test and the `host-packages` CI job exist only for `init`, and the table's whole reason for existing
is that a wrong name installs the wrong thing and an absent one installs nothing while appearing to
succeed. It exists once, where the only thing that reads it is. The manager is detected the way `init`
detects it — by which of `apt-get`, `dnf`, `pacman` is on PATH — rather than by parsing
`/etc/os-release`, because that is the check that has been right about this for a year.

**A failed build leaves its state on the view**, clickable to the terminal, with no notification. The
terminal already holds the whole error, which is where the cause is; a popup saying "the build failed"
repeats what the screen says and has to be dismissed before the useful text can be read. The cost is
that somebody with the view closed is not told, which is accepted.

**A cancelled build is not a failed one.** Closing the terminal is a decision, and the view says
"cancelled" rather than "failed". FR-66 asks for this specifically, and it is the thing that would
otherwise be indistinguishable: a terminal that closed with no exit status looks exactly like one that
died.

## Decisions taken at this gate

| decision | what it beat |
|---|---|
| a terminal whose process is `setup` | a Task (more API, cancellation as an explicit event) and `sendText` (editable text, no exit code) |
| checks on activation too, bounded | checks only before a build, which keeps activation fast and leaves the view unable to say anything about the host |
| failure state on the view | a notification with an action, and nothing at all |

**The Task was the stronger option on one point and lost on the rest.** It makes cancellation an
explicit event rather than an absent exit status, which is exactly what FR-66 needs — and a terminal
can tell them apart too, because `exitStatus` is `undefined` when the terminal is closed rather than
when the process exits. That is the whole of what the Task would have bought.

## Acceptance criteria

[`the-editor-builds.feature`](the-editor-builds.feature), beside this file. Agreed at the story gate,
before any task is written.

**Two scenarios are `@manual`**, and both are about a terminal that has to exist: that the build
really runs and streams, and that closing it reads as cancelled rather than failed. Everything else is
a pure function — which command would be composed, which package name a manager maps to, what a given
exit status means.

## Tasks

Written after this gate, not before.

| Order | Task | Repo | Status |
|---|---|---|---|
| — | — | — | — |

**The template half comes second, and not for tidiness.** Deleting `init` before the extension ships
its checks leaves releases in which neither side names a cause — which is the reason story 1 did not
delete it either.

## Out of scope

- **Building without an editor.** `setup` is still a script somebody can run; that is story 1's.
- **Anything about the container's lifecycle.** Bringing it up and attaching is the previous epic's,
  and shipped.
- **Reporting on the image after a build** — size, layers, what changed. Nothing asked for it and the
  terminal already shows what `docker build` says.

## Outcome

Filled in when the status leaves `Draft`.
