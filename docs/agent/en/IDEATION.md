# Ideation

The rules of the ideation container: the one the `Brainstorm` command opens, where an idea is
shaped before it becomes a project (epic *an idea is shaped in a container of its own before it
becomes a project*). They take the place of the development rules there. [Modes](MODES.md) and
[Rules](RULES.md) govern a project; this governs a container that is not one.

## No code is written

**In this container no code is written.** Not a prototype, not a spike, not a script to try an
idea. What is shaped here is what to build and why: who it is for, what was decided, what was
discarded, which stack. Code belongs to a project, which starts from an idea once it is `ready` and
goes through its own initialization, charter and SRS.

When a question can only be settled by trying something, write it down as an open question. It
becomes a spike in the project, where a spike is allowed and thrown away.

## One folder per idea

Every idea is a folder of its own: `ideas/<slug>/IDEA.md`, under the ideas folder in the developer's
`~/.claude/agent-container/`. The slug is short, lower case, words joined by hyphens, and chosen
with the developer when the idea starts. Nothing else goes in the ideas folder but these folders, the
memory's marker and the container's own `.devcontainer/`, which the `Brainstorm` command writes.

`IDEA.md` follows the contract the extension checks, described in the plugin's `ideas/README.md`
(`/opt/jvsl/plugins/agent-container/ideas/README.md` in the image):

- a front matter with a `state:`, and a `stacks:` map once a stack is talked about;
- four sections, spelled as the contract spells them, in English whatever language the rest is
  written in: `## Purpose and who it is for`, `## Decisions and discarded alternatives`,
  `## Stack` and `## Open questions`.

A new idea starts `raw`, with the four headings present and empty.

## The states

- `raw`: just started; little more than a sentence.
- `exploring`: being talked through.
- `ready`: whole enough to start a project from, after the consolidation below.
- `discarded`: not going ahead. It stays, with why, under its decisions; a discarded idea is what
  stops the same one being shaped again from nothing.
- `became project: <name>`: a project was created from it. **Only the extension marks this**, when
  *Create project* starts from the idea; the agent never writes it.

The agent changes the state only on the developer's word, and says so when it does.

## One conversation for all ideas

There is **one conversation for all ideas**, and one memory, kept between days. At the start of a
session, list the ideas with their states, and ask the developer which idea to continue or whether
to start another. Do not choose for them, and do not mix two ideas in one `IDEA.md`.

## Before ready, consolidate

The memory of this container does not follow an idea into its project: memory is one per container.
What crosses over is `IDEA.md` and nothing else. So **before an idea is marked `ready`, what lives
only in memory is consolidated into `IDEA.md`**: the decisions, the alternatives discarded and why,
the stack, and the questions still open. Read the memory for the idea, write what is missing, and
show the developer what was added before asking for the state to change.

An idea whose four sections are not all filled is not `ready`, and the contract refuses it.
