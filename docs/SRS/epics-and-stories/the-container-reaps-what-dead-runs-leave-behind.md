# Epic: the container reaps what dead runs leave behind

**The container reaps what dead test runs and dead language servers leave behind, and never touches
a live one.**

Agreed on 2026-10-21, from #186 and the orphaned JVMs in #187. Testcontainers runs with Ryuk
disabled here, because Ryuk cannot work under the nested rootless daemon, so a test JVM that dies
leaves its containers running. One Postgres held 7.16 GiB of an 8 GiB container, and the next build
was OOM-killed. An interrupted browser-test run leaves Chrome, chromedriver, the runner and vite
running under PID 1, holding ports and `/tmp` profiles. A Kotlin daemon whose Gradle daemon was
killed lives on. The epic closes when each kind is reaped once its run is provably dead, each reap
is logged with what and why, a live run is never touched, and a project can switch the reaper off.
Tracked as `jvsl_env_agents_container-66p`.

| # | Story | Why in that order |
|---|---|---|
| 1 | the reaper runs, says what it reaped, and can be switched off | the frame every kind plugs into, shipped with no kind |
| 2 | orphaned Testcontainers containers are reaped | the largest leftover: one held 7 GiB and caused the OOM kill |
| 3 | orphaned browser-test processes and their profiles are reaped | ports and memory held by dead WebdriverIO runs |
| 4 | orphaned JVMs are reaped | the backstop: after the Java stack's short idle times, a Kotlin orphan already exits in ten minutes |
| 5 | stale temporary files are reaped from every sandbox's /tmp | added on 2026-10-28 from #220: each ai-jail session's `/tmp` is a tmpfs of its own, charged to the container's memory, and one Iron Squid session filled 2.9 GB of it until chrome-headless was OOM-killed |

**Amended on 2026-10-28** to carry story 5. Its sentence grew to *"and what a live session's /tmp
keeps long after anything uses it"*: what an entry there is left over from is not a dead run but a
day nobody touched it. The container's own `/tmp` is left alone, because ai-jail mounts sandboxes
from files in it.
