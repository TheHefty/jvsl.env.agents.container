# Epic: the agent can measure the editor's processes and state

**The agent can measure the editor's processes and state.**

Proposed on 2026-10-30 (tracked as `jvsl_env_agents_container-8u9`) and agreed at the SRS gate on
2026-11-25. During `rjj` every measurement of jdt.ls, `~/.gradle` and `~/.vscode-server` had to be
run by the developer and pasted back, because `ai-jail` gives the agent its own PID namespace and a
private home (`core/bin/jail-common.sh`): it sees neither the editor's processes nor its state.

**Decided by João Lima before any story** (the grilling of 2026-11-25):

- **A service of fixed measures, outside the jail.** An s6 service publishes a fixed set of
  measures to a file; the agent reads the file and never the processes. Not chosen: sharing the
  PID namespace, which reopens a token read from another process's command line with `ps`; binding
  `~/.vscode-server` and `~/.gradle` into the jail, which shows extensions' stored data and nothing
  live; a snapshot the developer runs by hand, which leaves the measuring with them.
- **What it publishes:** the resident memory of a fixed list of the editor's processes, named — the
  Java language server, the Gradle daemon, the VS Code server; only the `-X` and `-XX` arguments of
  each JVM, never the rest of its command line or its environment; and the size of `~/.gradle`,
  `~/.vscode-server` and their first-level folders.
- **Two cadences:** the processes every 30 seconds, the folder sizes every 10 minutes, because a
  `du` of a `~/.gradle` of several gigabytes is not run twice a minute.
- **A widening, read-only.** The folder the file is in is mapped read-only into the jail — the
  folder, not the file, because the file is replaced by a rename and a map of a file keeps the old
  one.

Threat model: amended in docs/SRS/security.md, in the pull request that agrees this epic — the
jail gains a read-only map of the editor's measures.

| # | Story | Why in that order |
|---|---|---|
| 1 | a service outside the jail publishes the editor's measures | the file everything reads |
| 2 | the agent reads the editor's measures from inside the jail | needs the file; the widening |

## Story 1: a service outside the jail publishes the editor's measures

An s6 service, running as `abc`, writes the measures above to a file under
`/config/.local/state/jvsl/measures/`, replaced whole by a rename so a reader never sees half of
it, with the time of each measure. A process on the list that is not running is published as not
running. Threat model: amended in docs/SRS/security.md, in the pull request that agrees this epic.

```gherkin
Scenario: the language server's memory and flags are published
  Given the Java language server running with -Xmx2G
  When the service measures
  Then the file has its resident memory and -Xmx2G

Scenario: nothing else of a command line is published
  Given a JVM started with -Dtoken=secret and -Xmx2G
  When the service measures
  Then the file has -Xmx2G
  And it does not have the token

Scenario: the folders are measured less often
  Given the service running
  When 30 seconds pass
  Then the processes are measured again and the folder sizes are not
```

## Story 2: the agent reads the editor's measures from inside the jail

`jail-common.sh` maps the measures folder read-only, for Claude, Codex and OpenCode alike, and says
so when the folder is missing rather than mapping nothing silently. Threat model: amended in
docs/SRS/security.md, in the pull request that agrees this epic.

```gherkin
Scenario: the agent reads the measures
  Given the service has published
  When the agent reads the measures file inside the jail
  Then it sees the same measures as outside

Scenario: the agent cannot write them
  Given the agent's sandbox
  When it writes into the measures folder
  Then the write fails as read-only

Scenario: the jail still does not see the processes
  Given the agent's sandbox
  When it lists processes
  Then the editor's processes are not among them
```
