# Epic: the project decides at initialization whether Cucumber runs acceptance features

**A project decides at initialization whether Cucumber will execute its Gherkin acceptance scenarios.**

Agreed on 2026-11-01, from the developer's request. The initialization interview asks before the SRS is
written, but has no question about how Gherkin acceptance scenarios will be run. The rules make `.feature`
files documentation by default and leave wiring a runner to a task, so a project's preference is never
settled up front. The epic closes when initialization asks yes or no and the answer is recorded in the
SRS: a yes selects Cucumber as the intended acceptance runner without installing it, and a no keeps the
features as documentation with the project's native test suite as its executable checks. Tracked as
`jvsl_env_agents_container-56e`.

| # | Story | Why in that order |
|---|---|---|
| 1 | the initialization asks whether Cucumber runs acceptance features | FR-132 — the testing strategy is explicit before stories and tasks are written |
