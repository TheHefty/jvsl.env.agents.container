---
status: Draft
story: the-extension-carries-the-image/the-documents-arrive-with-the-image
epic: the-extension-carries-the-image
pr:
---

# Task: the-image-carries-them-and-a-hook-writes-them

## Summary

The image carries `docs/agent/` at a fixed path, a boot hook writes the two governing documents to
`/config/.claude/rules/`, and the generated configuration mounts that directory so the write cannot
reach the host. FR-84, FR-85, FR-86.

## The mount is a tmpfs, not a volume, and the measurement is why

The charter and the SRS both say *"the generated configuration mounts a **volume** over
`/config/.claude/rules` alone"*. Measured against what the configuration already does:

```ts
mounts: [
  `source=${names.volume},target=/config,type=volume`,
  `source=${homeDir}/.claude,target=/config/.claude,type=bind`,
]
```

`/config/.claude` is a **bind from the person's own `~/.claude`**, which is why FR-85 exists at all: a
hook writing the documents there writes into their personal configuration and reaches every project
on that machine.

**But a volume is the wrong instrument for what this holds.** The hook rewrites `rules/` on every
boot, so nothing in it ever needs to survive one — and a volume that survives every rebuild is a
place a document from a retired image can sit until somebody wonders why a rule they deleted is
still in force. A `tmpfs` cannot go stale, uses no disk, and raises no question about backing up
somebody's rules.

So this task proposes `target=/config/.claude/rules,type=tmpfs` and treats the charter's wording as
having named the mechanism before the content was known. **Recorded rather than quietly substituted**,
because the charter is a gate and this is a change to what it says.

## What goes in, and what must not

| | |
|---|---|
| written to `rules/` | `MODES.md` 6104 bytes + `RULES.md` 20484 = **26.6 KB resident in every session** |
| left readable at its path in the image | the other 25, `INITIALIZATION.md` at 13764 bytes above all |

FR-86 is that second row. `INITIALIZATION.md` describes a moment that happens once, and a consuming
monorepo already refused to import it for exactly this reason.

## Three worst failure scenarios

**1. The hook writes into the person's own `~/.claude`.** Without the mount, `/config/.claude/rules`
*is* a path inside their bind — so one project's rules appear in every project on that machine, and
the first symptom is a rule they never set being in force somewhere unrelated. **This is the scenario
the mount exists for, and the assertion cannot be "the mount is declared": it has to be that the hook
refuses to write when the directory it is writing to is not a mount of its own.** A declaration in a
file the hook never reads is not a guarantee the hook holds.

**2. The hook is silent about doing nothing.** `cont-init` hooks run at every boot and the healthy
case is the common one. A hook that writes nothing because the source directory is missing — a
mis-composed image — looks exactly like a hook that wrote correctly. The template's own pattern
answers this: the hooks are silent when there is nothing to do and say so in words when they refuse,
and `15-git-credential-helper.test.sh` asserts the silence by byte count.

**3. `rules/` accumulates.** A document renamed or retired upstream leaves its old copy in place if
the hook only ever adds. With a `tmpfs` this is answered by construction — the directory starts empty
every boot — which is the second reason for choosing it over a volume, and the one that would
otherwise need a delete-what-we-did-not-write step that deletes somebody's file the first time it is
wrong.

## Verification

| Test | Asserts |
|---|---|
| `core/cont-init/50-agent-rules.test.sh` | writes both documents; refuses and says so when the source is absent; **refuses when the target is not its own mount**; is silent on the healthy path, by byte count |
| `devcontainer.test.ts` | the configuration declares the `rules` mount, and declares it as `tmpfs` |
| `core/image.test.sh` | the built image carries `docs/agent/` at the fixed path |
| `core-booted` | the hook ran, and `rules/` holds exactly two files |

**The third scenario is why the hook's own test is the deliverable rather than the hook.** Writing two
files is four lines; refusing to write them into somebody's home directory is the part that has to be
seen failing.

## Out of scope

- **Removing the `.code-server/` submodule** — the next task, because `CLAUDE.md:32` still imports
  `MODES.md` from it and the import cannot go before its replacement is delivered.
- **Correcting the documents' stale premises**, recorded in `docs/agent/README.md` by the previous
  task.

## Outcome

Filled in when the status leaves `Draft`.
