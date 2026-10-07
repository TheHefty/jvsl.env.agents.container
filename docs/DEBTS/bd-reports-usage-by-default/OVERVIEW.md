# Debt: bd reports its usage by default

| | |
|---|---|
| **Status** | **Paid**, in the change that recorded it |
| **Date** | 2026-10-07 |
| **Kind** | defect: found during other work, and fixed in the same change |
| **Found while** | initialising this repository's own tracker |

## Problem

**bd ships with anonymous usage metrics turned on.** By its own description, it sends the name of
every command run, the bd version and the platform, keyed by an id derived from the machine. It says
it never sends issues, paths, remotes, identity or typed text.

The image installed bd in #105 without checking. **Every bd command run in this environment before
this change reported itself**, including the dozens run while measuring the tool on 2026-10-05 and
2026-10-06. Nobody had decided that anything should leave the machine.

## Root cause

The tool's behaviour on the network was not part of what was measured when it was adopted. The
measurements covered what bd writes into a repository, and not what it sends out of one. The notice
appears once, on the first run, in output nobody was reading for it.

## Fix

The operator decided on 2026-10-07 that nothing leaves the machine without a decision, the same
standard as ai-memory's provider. bd honours `DO_NOT_TRACK`, measured: `1` and `true` turn the
metrics off, and `0` leaves them on.

- **`ENV DO_NOT_TRACK=1`** in `core/Dockerfile.frag` (7.3.1), for the boot hook and a person's
  terminal.
- **`--env DO_NOT_TRACK=1`** in `core/bin/jail-common.sh`, because ai-jail clears the sandbox's
  environment. Measured inside a jailed session: no `DO_NOT_TRACK` there. It is a literal, not the
  caller's value, so a shell that unset it cannot undo the image's decision.

## Regression scenario

- `core/image.test.sh`: `bd metrics status` in the built image reports `OFF`.
- `core/bin/jail-wrappers.test.sh`: the sandbox is handed `DO_NOT_TRACK=1` even when the caller's
  environment lacks it.
- `core/bin/jail-env-allowlist.test.sh` names `DO_NOT_TRACK` as an allowed, non-secret variable.

## Payback

Paid. What was already sent cannot be recalled.

## Outcome

Paid on 2026-10-07.
