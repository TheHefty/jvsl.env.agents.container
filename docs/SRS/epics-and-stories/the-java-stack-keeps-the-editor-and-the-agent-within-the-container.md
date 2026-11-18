# Epic: the Java stack keeps the editor and the agent within the container

**The Java stack keeps the editor and the agent within the container the project chose.**

Agreed on 2026-10-21, from #183 and #187, measured in kotodori. With no stack up, the container sat
at its memory ceiling with five OOM kills. The JVMs ran on their default heaps. Daemons stayed idle
for three hours. A restarted language server left its previous generation running. A Gradle 9.x
started by the editor wrote into the same included build as the project's 8.14.3 wrapper and
corrupted it. The ceiling itself is the project's choice in its manifest, so it is not part of this
epic. Reaping what dead runs leave behind is not part of it either: that applies to every stack and
is an epic of its own. This epic closes when only the project's wrapper runs Gradle on a project,
and every JVM the stack starts has a bound that a project can still raise. That holds in the
editor, in a terminal and in the agent's sandbox. Tracked as `jvsl_env_agents_container-um2`.

| # | Story | Why in that order |
|---|---|---|
| 1 | only the project's wrapper runs Gradle on a project | #183. Corruption comes first, because it fails builds whatever the memory |
| 2 | every JVM the stack starts has a bounded heap and a short idle life | #187 causes 2–4. Editor, terminal and sandbox share one bound, and a project can raise it |
| 3 | the Java language server runs one generation, with its own ceiling | #187 cause 1, the prevention. Reaping orphans belongs to the reaper epic (#186) |
