# Debt: the sandbox under AppArmor

| | |
|---|---|
| **Status** | Recorded, not fixed |
| **Found** | 2026-10-06, while making `core/booted.test.sh` run `claude` through the jail |
| **Kind** | A suspected product limitation, inferred from CI and not observed on a real host |

## Problem

Run in CI, the agent's sandbox did not reach anything it would mount:

```
▸ Jail Active: /
bwrap: Failed to make / slave: Permission denied
```

GitHub's runners are Ubuntu with AppArmor enforcing. On such a host docker applies its default
profile, `docker-default`, which denies `mount` inside the container — and `bwrap` needs to mount to
build the sandbox. The harness container passes `seccomp=unconfined` and `systempaths=unconfined`,
which are what the generated dev container configuration passes, and not `apparmor=unconfined`.

**So on a host enforcing AppArmor, `claude` may not start at all**, for every project, regardless of
anything else in the image. The operator's host does not enforce AppArmor, which is why nobody has
seen it.

## What is and is not known

- **Known:** the harness fails this way on a GitHub runner, and passing `apparmor=unconfined` to the
  harness's container is what lets the test reach the defect it exists for.
- **Not known:** that a real Ubuntu desktop with the generated configuration fails the same way. No
  such host has been tried. This is an inference from CI, written down as one.

## Fix, not done

Adding `--security-opt apparmor=unconfined` to the generated configuration's `securityOpt` would
likely make the sandbox open on such hosts. **It is a widening of the container's confinement**, and
the inherited rules say a widening is a decision rather than a workaround — so it is the operator's,
and it is not made here.

The alternative worth weighing is a narrower AppArmor profile that allows the mounts bwrap needs and
nothing else, which is more work and less of a widening.

## Regression scenario

The harness carries `apparmor=unconfined` and says why in a comment beside it. If the product ever
gains the option, the harness should stop needing its own — at which point the two should be the
same line, and that is the test.

## Payback

When anybody runs this on a host that enforces AppArmor, or before the extension is offered to
anyone whose host does.

## Outcome

Open.
