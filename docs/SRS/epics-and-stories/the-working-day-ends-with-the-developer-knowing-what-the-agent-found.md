# Epic: the working day ends with the developer knowing what the agent found

**Every image carries four ceremonies, as skills, that turn a day of agent work into knowledge the
developer holds.**

Agreed on 2026-10-28, from #221. Agents write most of the code; decisions stay with the developer,
but what the agent discovers on the way — a library default, a hidden bug, a workaround — ends up in
commits and documents rather than in anybody's head, and there was no moment where it came back.
The planning, at the start of the day, picks today's agreed tasks; review, retro and refinement close
it. The epic closes when a project the extension created, with the tracker on, runs the whole cycle
with nothing but what the image brings. Tracked as `jvsl_env_agents_container-338`.

**Decided by João Lima before any story, each over a named alternative:**

| | chosen | over |
|---|---|---|
| the chain | the ceremonies are its calendar: refinement is where stories and tasks are proposed and agreed, and the planning picks only agreed tasks | a shortcut letting a refined item go straight to code, which would leave two rules and weaken the task gate |
| the journal | one tracker item a day, labelled `journal` | `docs/JOURNAL/`, a pull request a day on a protected branch; `ai-memory`, which only some projects have and which is treated as untrusted history |
| reach | projects with `"beads": true`; elsewhere the skills refuse in one line saying how to turn the tracker on | a fallback over planning files, a second implementation of every skill |
| review | accepts only after the developer explains the change in their own words, always | a per-item skip, the shortcut most likely to become the default |

**The skills are a plugin the image carries**, at `/opt/jvsl/plugins/agent-container`, loaded by the
`claude` wrapper with `--plugin-dir`. `~/.claude` is the developer's own, bound from the host, so
the image writes nothing there: a tmpfs over `skills/` was rejected because it would hide the
developer's own skills inside the container.

**Accepting is not merging.** A review records acceptance, and the task closes when the change that
finishes it is merged, as items already do.

| # | Story | Why in that order |
|---|---|---|
| 1 | the image delivers the agent's skills | the plugin every ceremony arrives in, and the refusal they share |
| 2 | the planning | needs only the tracker |
| 3 | the review | needs worked tasks to review |
| 4 | the retro and its journal | the journal the study epic reads `blog-candidate` from |
| 5 | refinement | proposes what tomorrow's planning picks |
| 6 | the working agreement describes the day | normative documents, both languages; last, so it describes what exists |

**Renamed on 2026-10-28, by João Lima: the daily is called planning.** The ceremony chooses the
day's work, which "daily" did not say. The rename went everywhere, the plugin's scripts and the
tests' names included: a leftover of an old name does not fail, it confuses.

**What a test cannot hold here.** A skill is instructions to the agent, so "asks before assuming" or
"never writes the developer's line" is verified by running the cycle, not by a suite. What is
mechanical — delivery, refusal, the tracker's state — is tested like everything else.
