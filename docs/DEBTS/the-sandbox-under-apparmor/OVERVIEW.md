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

**A second AppArmor restriction sits on the host, not on the container.** With the harness
unconfined, the next run failed earlier:

```
bwrap: setting up uid map: Permission denied
```

Ubuntu 24.04 sets `kernel.apparmor_restrict_unprivileged_userns=1`. That refuses an unprivileged
process a user namespace, and bwrap needs one. Turning it off on the runner with `sysctl` got the
jail open, and then `claude` itself aborted under Landlock. Bun panicked, where the same image
starts it on the operator's host. CI therefore skips the jail check, with that reason printed. A
person's Ubuntu 24.04 host would have the same default, and nothing in the generated configuration
can change a host's kernel setting.

## What is and is not known

- **Known:** the harness fails this way on a GitHub runner, and passing `apparmor=unconfined` to the
  harness's container is what lets the test reach the defect it exists for.
- **Not known:** that a real Ubuntu desktop with the generated configuration fails either way. No
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
