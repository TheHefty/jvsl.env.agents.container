# Epic: the container says what its boot hooks decided where the developer looks

**The container says what its boot hooks decided where the developer looks.**

Proposed on 2026-10-30 (tracked as `jvsl_env_agents_container-djy`) and agreed at the SRS gate on
2026-11-25. The boot hooks and the reaper decide things nobody sees: `36-editor-settings` keeps a
setting the developer changed instead of the image's, `35-editor-extensions` removes the marker so a
new stack's extension is installed, and the reaper kills leftovers. During `rjj` and on chip8 the
evidence for each came from `docker logs | grep` and `reaper.log`, read by hand.

**Decided by João Lima before any story** (the grilling of 2026-11-25):

- **One log and one command.** The two boot hooks and the reaper write their decisions to one log,
  and a command on the container's `PATH` reads it. Nothing is pushed at the developer: not the
  panel, not the planning, not a notification.
- **Only the developer reads it.** The log stays where the reaper's is, under
  `/config/.local/state/jvsl/`, which the jail does not map; the sandbox is not widened.
- **Rotated as the reaper's is.** One file and one `.1`, swapped at a fixed size: the recent boots,
  not a history.

Threat model: unchanged — the log is outside the sandbox, as `reaper.log` is today, and records a
setting's key, never its value.

| # | Story | Why in that order |
|---|---|---|
| 1 | the boot hooks and the reaper write their decisions to one log | the log the command reads |
| 2 | one command shows what the container decided | needs the log |

## Story 1: the boot hooks and the reaper write their decisions to one log

`36-editor-settings` records each setting it wrote and each it kept as the developer's, by key and
never by value; `35-editor-extensions` records a changed extension list, naming what was added and
removed; the reaper records what it killed, by kind, name and pid, in place of its own
`reaper.log`. Each line carries the time and who decided. The log is rotated as `reaper.log` is: one
file and one `.1`, neither past a fixed size. Threat model: unchanged — outside the sandbox, and no
setting's value is written.

```gherkin
Scenario: a setting kept as the developer's is recorded
  Given the developer changed java.jdt.ls.vmargs in Remote Settings
  When the container boots
  Then the decisions log says the key was kept as the developer's
  And the value does not appear in it

Scenario: a changed extension list is recorded
  Given a stack added since the last boot
  When the container boots
  Then the decisions log names the extension added

Scenario: what the reaper kills is recorded
  Given a leftover browser from a test run
  When the reaper kills it
  Then the decisions log names its kind and pid

Scenario: the log never grows past its bound
  Given a decisions log at its size limit
  When another decision is recorded
  Then the old log becomes the .1 and neither file is past the limit
```

## Story 2: one command shows what the container decided

A command on the container's `PATH` prints the decisions log, newest boot first, grouped by boot. Run
from inside the jail, where the log is not mapped, it says so and where to run it instead. Threat
model: unchanged — it reads a file outside the sandbox.

```gherkin
Scenario: the developer reads the decisions
  Given decisions recorded over two boots
  When the developer runs the command in a terminal of the container
  Then it prints them grouped by boot, the newest first

Scenario: inside the jail it says why it shows nothing
  Given the agent's sandbox, where the log is not mapped
  When the command runs there
  Then it says the log is outside the sandbox and to run it in a terminal of the container
```
