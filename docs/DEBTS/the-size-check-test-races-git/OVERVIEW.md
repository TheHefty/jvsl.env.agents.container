# Debt: the size check's test races git's own maintenance

| | |
|---|---|
| **Status** | Open |
| **Date** | 2026-10-07 |
| **Kind** | defect: found during other work and not yet fixed |
| **Found in** | CI run 37570628499 of #126, whose change had nothing to do with it |

## Problem

`scripts/check-md-size.test.sh` failed in CI with:

```
cp: cannot stat '/tmp/tmp.pQIL7bwtct/.git/objects/maintenance.lock': No such file or directory
```

Its check passed in the same job ("114 tracked Markdown file(s) … all under 50 KiB"). A rerun of the
failed jobs was green. Any pull request can go red this way for a reason that is not its own, and
`ci-green` makes that red block the merge.

## Root cause

**Inferred from the error, not reproduced.** The case "an embedded repository's files are not the
parent's problem" commits in a scratch repository and then copies that repository, `.git` included,
with `cp -r` (`scripts/check-md-size.test.sh`, around line 98). The runner's git (2.55) runs
maintenance in the background after a commit, and its `maintenance.lock` exists only while that
runs. `cp -r` listed it and then could not find it.

## Fix

Not made. Two candidates, to be chosen when the debt is paid:

- disable automatic maintenance in the scratch repositories the test makes (`git -c
  maintenance.auto=false`, or `gc.auto=0`), so nothing runs behind the copy;
- build the embedded repository in place instead of copying a live one.

## Regression scenario

The test passes on a runner whose git runs background maintenance after a commit. That is
reproducible by forcing maintenance on in the scratch repository and copying while it runs.

## Payback

Before it reddens a pull request that matters. It costs a rerun each time it happens.

## Outcome

Open.
