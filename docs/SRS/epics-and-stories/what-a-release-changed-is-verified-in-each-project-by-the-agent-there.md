# Epic: what a release changed is verified in each project by the agent there

**What a release changed is verified in each project by the agent there.**

Proposed on 2026-10-30 as `verifying-a-release-in-each-project-is-guided-by-the-agent` (tracked as
`jvsl_env_agents_container-fo3`) and agreed at the SRS gate on 2026-11-25. On 2026-10-29 the agent
wrote validation prompts for kotodori and Iron Squid by hand, the developer carried the reports
back, and items were closed from them; ten stories sat under *Awaiting verification*. On
2026-11-25 five did again — `5kd.3`, `5kd.4`, `5kd.5`, `kr7.4`, `izb` — each needing something only
another project's container could show.

**Decided by João Lima before any story** (the grilling of 2026-11-25):

- **A queue in the developer's `~/.claude`, written only by the extension.** The extension, on the
  host, writes one request per project the developer names, from the stories awaiting verification
  and their scenarios. Every container sees the requests **read-only**, as it sees the ideas: a
  request is an instruction an agent runs, and a container that could write one could make another
  project's agent run it.
- **A skill the developer runs in the project, not a hook.** Nothing is injected into every session;
  the developer runs `verify` in a project when they choose. The agent there runs each scenario as a
  check and writes a report beside the queue, in a folder it can write.
- **What passed everywhere closes by itself.** At refinement, a story or debt whose every scenario
  passed in every project it was requested for, at the release it was requested for, is verified and
  closed with the reports as its reason. Anything else — a failure, a scenario not applicable, a
  project that has not reported — is shown to the developer, whose word closes it or not. This
  changes the inherited rule that a story closes on the developer's yes; the rule says so in both
  languages.
- **A forged report is an accepted risk.** Reports are writable by every container, so one could be
  forged and close an item; accepted because every container on the machine is the developer's, and
  a story closed wrongly is reopened.

Threat model: amended in docs/SRS/security.md, in the pull request that agrees this epic — a new
surface: requests an agent runs, read-only in every container; and reports that close items,
writable by every container.

| # | Story | Why in that order |
|---|---|---|
| 1 | the extension writes a verification request for each project the developer names | the queue everything below reads |
| 2 | the verify skill runs a project's requests and writes its report | needs a request to run |
| 3 | refinement closes what passed in every project | needs reports; the rule change |

## Story 1: the extension writes a verification request for each project the developer names

A command, run in this repository's window, reads the items awaiting verification and their
scenarios from the tracker, asks which projects each is to be verified in, and writes one request
per project under `~/.claude/agent-container/verifications/requests/<project>/`, naming the release.
Every generated configuration binds that folder read-only, the Brainstorm's too.
Threat model: amended in docs/SRS/security.md, in the pull request that agrees this epic.

```gherkin
Scenario: a request is written for each project named
  Given two stories awaiting verification
  When the developer requests verification in kotodori and Iron Squid
  Then each project has a request naming the release, the stories and their scenarios

Scenario: no container can write a request
  Given a project's container
  When anything in it writes under the requests folder
  Then the write fails as read-only
```

## Story 2: the verify skill runs a project's requests and writes its report

The plugin's `verify` skill, run by the developer in a project, reads that project's requests, runs
each scenario as a check against the project as it is, and writes a report per request: each
scenario passed, failed or not applicable, with the evidence — the command and what it printed —
and the release the container is on. A container on another release reports that, and checks
nothing. Threat model: amended in docs/SRS/security.md, in the pull request that agrees this epic.

```gherkin
Scenario: a project's requests are run and reported
  Given a request for this project
  When the developer runs verify
  Then a report names each scenario as passed, failed or not applicable, with its evidence

Scenario: a container on another release checks nothing
  Given a request for a release this container is not on
  When verify runs
  Then the report says which release the container is on
  And no scenario is marked passed
```

## Story 3: refinement closes what passed in every project

`refine-candidates` reads the reports. An item whose every scenario passed in every project it was
requested for, at the requested release, is verified and closed with the reports cited as the
reason; anything else is listed with what is missing or failed, for the developer's word. `RULES.md`
and `WORKING-DAY.md`, both languages, say a story or debt also closes this way.
Threat model: amended in docs/SRS/security.md, in the pull request that agrees this epic.

```gherkin
Scenario: what passed everywhere closes
  Given a story whose scenarios passed in both projects it was requested for
  When refinement runs
  Then the story is verified and closed, its reason citing both reports

Scenario: anything short of that waits for the developer
  Given a story with a scenario failed in one project, or a project that has not reported
  When refinement runs
  Then it is listed with what failed or is missing
  And it is not closed
```
