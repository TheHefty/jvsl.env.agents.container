# Security

What this system has to be protected from, and what was decided about it. Added on 2026-11-23 by
`jvsl_env_agents_container-kr7.2.2`, from #362: this SRS was agreed before the template carried a
Security section, so it is written here before the next story gate rather than migrated by the
agent.

**Here the application is the environment itself** — the extension, and the image it composes and
builds. So this is the threat model of a developer's working environment, not of something it
serves to anyone else.

## Threat model

**Written by João Lima**, answering the three questions in the interview of 2026-11-23.

- **What has value** — the host: the developer's machine, its files and session, and what runs
  outside the container. The credentials mounted into the container (GitHub, `~/.claude`,
  `~/.codex/auth.json` and the like), which give access to accounts and repositories. The projects'
  code, their remotes and their history, the tracker in `refs/dolt/data` included. And the delivery
  chain: the `.vsix` and the image it builds, which, tampered with, reach every project that uses
  them.
- **Who would want it** — the agent itself: an AI agent that errs, is steered by prompt injection,
  or acts beyond what it was asked. Untrusted code: a build, a dependency's script or a cloned
  repository running inside the container. A compromised upstream: whoever controls a release, a
  tag or a registry the image depends on.
- **Through which entry** — processes in the container that run outside the jail: builds and
  terminals, which see `ps` and the gpg-agent and X11 sockets the editor forwards. Dependencies
  fetched while the image is built: releases, base images and packages. The extension and this
  repository: the published `.vsix`, and whoever can merge or release here.

## Controls

**Proposed by the agent as an options list, one per threat, chosen by João Lima on 2026-11-23.** The
developer's bet before the list was that what already exists is enough; every choice below agrees.

| Threat | Chosen | Why | Not chosen |
|---|---|---|---|
| **T1** — the agent leaves the jail for the host or the credentials, through processes in the container | The jail as it is: `claude`, `codex` and `opencode` run under `ai-jail` by default, a project's `.ai-jail` can only tighten it, and credentials reach it as files, never as variables (FR-3x) | It holds the agent, which is the threat [the charter](../CHARTER.md) names; costs nothing more | An escape test in CI, trying `ps`, the sockets and `~/.claude` from inside the jail — right if an `ai-jail` release had already changed the map unseen |
| **T2** — untrusted code in the container reads credentials or uses the forwarded sockets | Documented and accepted: FR-37 records that the sockets cannot be prevented by anything this project controls, and that a project which cannot accept that does not run an untrusted build here | Only trusted builds are run here; it becomes an accepted risk below | Running builds inside the jail too — right if third-party builds were routine; toolchains, the nested daemon and the network would each need a grant |
| **T3** — a compromised upstream swaps a dependency fetched while the image is built | Pin and digest as today: an exact version and a `sha256` in the fragments, and a bump is a deliberate step that reads the release notes | Every fetched dependency goes through it; costs nothing more | A CI guard failing when a `Dockerfile.frag` fetches something with no `sha256` beside it — right if a download without a digest had got in, or could, unnoticed |
| **T4** — the delivery chain is tampered with: the `.vsix`, a merge, a release | What exists: a protected default branch with a pull request for every change, the `.vsix` built from the tag and read back, and the allowlist of what ships in it (`tools/vsix.test.ts`) | The owners of the actions CI uses are trusted; the actions pinned by tag become an accepted risk below | Pinning the four GitHub Actions by commit SHA — right if "a tag is not immutable" is held to apply to the CI that publishes the `.vsix` too; costs manual bumps or Dependabot |

## Accepted risks

**Accepted by João Lima on 2026-11-23.** What the controls above leave open on purpose, and why.

- **A build reaches the sockets.** Any process outside the jail — a build, a terminal — reaches the
  gpg-agent and X11 sockets and the container's `ps`. Accepted because only builds the developer
  trusts are run here, and the editor creates the sockets with nothing here able to stop it
  (FR-37).
- **The actions are pinned by tag.** The CI that builds and publishes the `.vsix` uses GitHub Actions
  pinned by tag (`actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`,
  `googleapis/release-please-action@v4`), and a tag can be repointed. Accepted because their owners
  are GitHub and Google, and keeping SHAs current does not pay for itself today.
- **The jail is trusted without a test.** That the jail holds the agent is trusted to `ai-jail`
  pinned by digest, with no escape test in CI. Accepted because bumping `ai-jail` is deliberate and
  reads its release notes.
