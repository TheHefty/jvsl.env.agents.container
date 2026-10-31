<!-- jvsl.env.agents.container: generated. Delete this line and this file is yours; the extension will
     not touch it again. Keep it and a newer extension may replace the file wholesale. -->

# CLAUDE.md

Guidance for Claude Code working in this repository.

## Standing answers

- **The mode is Pair Programming Mode.** The agent drives, the user navigates. It governs every
  session until somebody says otherwise.
- **The documentation language is English**, including commit messages.

They are standing answers once initialization is done, and defaults before it: while this file still
carries the line pointing at `/opt/jvsl/docs/agent/en/INITIALIZATION.md`, the mode and the language
are two of initialization's questions — ask the developer to confirm or change each rather than
treating these lines as decided, and record the confirmed answers here in their place. When that line
is deleted, the two above are standing answers: they govern every session until somebody says
otherwise, and neither is re-asked every session.

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

## This project's own rules, and the documents read on demand

**This project's own standing rules are in `docs/RULES.md`**, imported here so they are read in every
session. That file is inside this repository, so the import is not an external one. It holds this
project's rules and nothing inherited. Initialization writes it beside `docs/CHARTER.md` and the
SRS; until then the import resolves to nothing, which is expected before the charter and a gap
after it.

@docs/RULES.md

The documents read when they are relevant — `INITIALIZATION.md`, `WORKFLOW.md`, the charter, SRS,
story, task and debt templates — ship with the image at `/opt/jvsl/docs/agent/en/`, with
`/opt/jvsl/docs/agent/pt-BR/` beside it. **While initialization is unfinished, read
`/opt/jvsl/docs/agent/en/INITIALIZATION.md` first**, and delete this sentence when it is done.

## The gates, which are in this file on purpose

They are written here rather than loaded from anywhere, because they have to survive everything
above not arriving:

**Charter, then SRS, then epic, then story with its scenarios, then task with its design, then
code.** Each is agreed with the user before the next is written. A design settled after the code
exists is a justification, and scenarios written after the implementation describe what was built
rather than what was wanted.

**A round of work is planned whole before any of it is built.** Every epic the user's request gives
rise to, and every story under each with its scenarios, is agreed before the first task of any of
them; work found along the way is planned whole too, before its own code.

## This project

Replace this section. It is where what makes this repository different belongs — what it is, what
it builds, the commands that matter, and the facts somebody needs before reading anything else.
