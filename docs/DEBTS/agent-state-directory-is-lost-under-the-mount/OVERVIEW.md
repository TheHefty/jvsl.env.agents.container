# Debt: the agent state directory is lost under the mount

| | |
|---|---|
| **Status** | **Paid** — found and fixed on 2026-10-05 |
| **Found** | 2026-10-05, while grilling the *agents screen* epic |
| **Kind** | A defect found outside the chain and fixed in the same change that recorded it |
| **Rule it breaks** | the repository's own, stated in `core/cont-init/10-state-ownership.sh` and again in section 5.0 of `core/Dockerfile.frag` |

## Problem

**`/config/.codex` does not exist in a running container**, although `core/Dockerfile.frag:198`
creates it. Read inside one:

```
$ ls -la /config/.codex/
ls: cannot access '/config/.codex/': No such file or directory
```

**And `core/bin/codex.sh:35-36` asserts that it does**, in a comment explaining why Codex's login
persists:

> `--agent-state` maps `~/.codex`, and section 5 of `core/Dockerfile.frag` creates `/config/.codex`
> so there is a directory there to map.

The first half is true and the second is false, which makes the conclusion false. A comment claiming
a mechanism that is not there is the same defect this repository already recorded once, in
[`forwarded-secrets-land-in-the-sandbox-argv`](../forwarded-secrets-land-in-the-sandbox-argv/): it is
why nobody looks.

## What it costs, in the repository's own words

`core/Dockerfile.frag:194-197`, the comment directly above the line that does not take effect:

> `ai-jail` maps into the sandbox only the paths that already exist, so a directory missing here is
> not created inside the jail — it is simply absent, and the agent starts at onboarding on every
> single run with nothing saying why.

So the symptom of this defect is **Codex asking to log in every time**, with its credential going
nowhere that survives.

**That is also the symptom that justified an epic, and the epic was deleted.** The *agents screen*
was proposed because a login was lost on a rebuild; grilling it on 2026-10-05 established that the
loss happened in the retired code-server template, which had this same arrangement. The symptom
matches and the mechanism is present. **It is not proven to be the same incident** — the environment
where the loss happened is archived and cannot be measured — so this records a strong candidate
cause, not a diagnosis.

## Root cause

**Image content under a mountpoint is not a guarantee, and the shape of the mount decides whether it
survives at all.**

| mount over `/config` | what happens to the image's `/config/.codex` |
|---|---|
| named volume, created empty | copied in on first mount — the line works |
| named volume that already has content | **never copied** — Docker seeds a volume only when it is empty |
| `tmpfs` | **never copied** — a tmpfs always starts empty, with no seeding step at all |

Two populations are therefore affected: any container whose `/config` is a `tmpfs`, and **any project
whose volume was created before line 198 existed** — which is every project that predates it, because
the volume outlives every rebuild.

**The repository already states this rule and already obeys it twice.**
`core/cont-init/10-state-ownership.sh:6-9` says it outright:

> Everything it touches is under `/config`, which is a named volume: Docker seeds it from the image
> only on its *first* mount, so damage done there outlives every rebuild. The same reason
> `40-ai-memory.sh` runs at boot rather than at build.

`10-state-ownership.sh` and `40-ai-memory.sh` both run at boot for exactly this reason. Section 5 of
the Dockerfile does the same class of work at build time, and is the one place that did not follow.

**And the Dockerfile states the rule ten lines below breaking it.** Section 5.0, immediately after,
explains why *it* belongs at build time rather than in a boot hook:

> /etc/passwd is not under `/config`, so the problem a boot hook would exist to work around — a named
> volume is seeded from the image only on its first mount, so anything written into `/config` at build
> time never reaches an environment that already exists — does not apply.

The test it applies is exactly right, and section 5 fails it: those two directories *are* under
`/config`. The rule was never missing. It was written down, correctly, adjacent to the one place that
did not apply it.

## Why `.claude` is unhurt and `.codex` is not

Line 198 creates **two** directories and only one of them has a second mechanism holding it up. The
generated configuration binds the host's `~/.claude` onto `/config/.claude`
(`src/devcontainer.ts:108`), and a bind mount creates its target. So `.claude` exists however the
volume behaves, by accident of a different decision, and `.codex` has nothing rescuing it.

That asymmetry is why this went unnoticed: the line looks like it works, because half of it does.

## Why no existing guard caught it

**Because the defect does not exist at build time.** Each stack's in-image assertions run during
`docker build`, where `/config` is ordinary image filesystem and the directory is really there. The
mount that hides it is a *runtime* fact. A build-time test cannot observe this, and every test this
repository has for image content is a build-time test.

This is the part worth carrying forward past this debt: **an assertion about a path under `/config`
proves nothing unless it runs after the mount.**

## Fix

Four parts, all in the change that recorded this.

1. **`core/cont-init/45-agent-state-dirs.sh`** creates `/config/.claude` and `/config/.codex` at boot
   and gives them to `abc`. `mkdir -p` so an existing directory with a credential in it is untouched,
   and `chown` without `-R` so no boot ever walks an agent's accumulated state — the cost
   `10-state-ownership.sh` refuses for the same reason.
2. **The Dockerfile keeps its build-time `mkdir`** and gains the `COPY` of the hook. Keeping it is
   deliberate: it is correct for a volume created empty, costs nothing otherwise, and leaves the image
   honest when read on its own. What changed is that it is no longer the *only* mechanism.
3. **`core/bin/codex.sh` stops asserting what section 5 guarantees.** The comment now says the boot
   hook is what guarantees the directory, and says plainly that the previous version was wrong and
   what the wrongness cost.
4. **The boot harness asserts it**, which is the part that makes the other three mean something.

## Regression scenario

**`core/booted.test.sh`, in a second container booted with `--tmpfs /config`.** It asserts both
directories exist and belong to `abc` after init.

**The mount shape is the whole test.** The harness's existing boot has nothing over `/config`, where
the image layer is really there — which is precisely why every test this repository had stayed green
while the directories were absent in practice. `--tmpfs /config` reproduces the harsher of the two
affected populations in one flag, and the other (a volume that already has content) fails the same
way for the same reason.

**Observed red, then green.** Against the stand-in fixture, before the hook existed:

> `booted.test: FAIL: /config/.claude does not exist after a boot with /config shadowed. The
> Dockerfile's mkdir cannot be the only mechanism…`

and after:

> `…and with /config shadowed by a tmpfs both agent state directories still exist and belong to abc.`

**And reproduced on the real image, not only on the stand-in.** `core/booted.test.sh` passes against
a locally built `core` image, and the mechanism was isolated with one more run — the real image with
a tmpfs over `/config` and `--entrypoint`, so s6-overlay never starts and no boot hook runs:

```
$ docker run --rm --tmpfs /config --entrypoint /bin/bash core-local -c 'ls -a /config'
.
..
```

`/config` is **empty**. Not missing one directory: nothing from that image layer survives the mount.
So the hook is demonstrably what creates them, rather than something else in the image happening to.

**No unit test beside the hook, and that is a decision rather than an omission.** A unit test of this
script would assert that `mkdir -p` makes a directory — the shell, not the behaviour. The defect was
never in the mkdir; it was in *when* it ran relative to the mount, and only a booted container can
see that. The boot harness is the level the problem was found at, so it is the level the test lives
at.

**What this says past this debt:** an assertion about a path under `/config` proves nothing unless it
runs after the mount. Every image-content test this repository had was a build-time test.

## Payback

**Paid in the same change, rather than deferred.** It was first recorded as deferred, and that
decision was made on weaker information: the finding looked like a dead `mkdir` and an imprecise
comment. Three things changed it — it violates a rule this repository states twice in its own words,
the fix is a pattern already used twice in the same directory, and it blocks the first-entry agent
login designed into
[`forwarded-secrets-land-in-the-sandbox-argv`](../forwarded-secrets-land-in-the-sandbox-argv/). That
feature runs `codex login` and needs a `~/.codex` for the credential to persist in; shipping it over
this defect would have asked for a login on every container start, forever, and looked like the
feature was the bug.

## Outcome

**Closed on 2026-10-05, the day it was found.** What it leaves behind is not the fix but the
measurement rule in *Regression scenario*: image content under `/config` is a claim about a mount, and
only a booted container can settle it.
