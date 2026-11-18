# Epic: the editor composes and builds this project's image

**`whiptail` is retired and the questions it asked are asked by the editor instead.**

The epic closes when selecting stacks, versions and limits happens in the editor, the build runs
from there, and nothing on the host needs `whiptail` any more. `setup` keeps composing and building;
what moves is the asking.

**The cold-start problem this epic was expected to carry turns out not to apply.** It was named here
as "a project with no image cannot have its stacks analysed by an agent, because the agent runs
inside the image". That is about *detecting* what a project needs, which belongs to the adoption
epic. This epic only *asks*, and asking happens on the host in the editor, before any container
exists.

| # | Story | Repo | Why in that order |
|---|---|---|---|
| 1 | the template stops asking | template | FR-63: the non-interactive `setup` has to exist before anything can invoke it |
| 2 | the editor asks | extension | needs a manifest format to write and a `setup` to hand it to |
| 3 | the editor builds | extension | needs both of the above |

Story 1 is the only one with image builds behind it, and it is where `whiptail` actually leaves:
`setup`, `init`, `packages.sh` and the host prerequisite list. Stories 2 and 3 are the extension's
and are tested without an editor — the five steps are pure functions over a manifest, and the build
is a command that composes a task.
