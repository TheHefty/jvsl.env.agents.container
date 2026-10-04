<!-- jvsl.env.agents.vscode: generated. Delete this line and this file is yours; the extension will
     not touch it again. Keep it and a newer extension may replace the file wholesale. -->

# CLAUDE.md

Guidance for Claude Code working in this repository.

## Standing answers

- **The mode is Pair Programming Mode.** The agent drives, the user navigates. It governs every
  session until somebody says otherwise.
- **The documentation language is English**, including commit messages. Change this line if that is
  wrong for this project, and it stops being true the moment you do.

## Where the rules are

**The modes and the ground rules are not in this file and are not copied into this repository.**
They arrive with the container image and are loaded from the agent's own configuration directory, so
a rule corrected upstream reaches this project when it rebuilds rather than when somebody remembers
to copy it.

Nothing here imports them. That is deliberate: an `@path` import that resolves outside this
directory is classified as *external*, and declining its approval dialog once disables it
permanently with nothing said afterwards — leaving an agent with no modes, no rules and no gates and
no way to tell.

**So if you are an agent reading this and you cannot see the pairing modes or the ground rules in
your context, stop and say so.** Working without them is not working under a lighter process; it is
working with no mode, no rules and no gates, and nothing failed to tell anybody.

## The gates, which are in this file on purpose

They are written here rather than loaded from anywhere, because they have to survive everything
above not arriving:

**Charter, then SRS, then epic, then story with its scenarios, then task with its design, then
code.** Each is agreed with the user before the next is written. A design settled after the code
exists is a justification, and scenarios written after the implementation describe what was built
rather than what was wanted.

## This project

Replace this section. It is where what makes this repository different belongs — what it is, what
it builds, the commands that matter, and the facts somebody needs before reading anything else.
