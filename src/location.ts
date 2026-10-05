import { readdirSync, statSync } from 'node:fs'

/**
 * Whether a chosen directory can be scaffolded into.
 *
 * **Validated when it is answered rather than when it is used**, because an
 * answer that cannot be refused later is an answer that wasted five more
 * questions. The next task checks again before writing, for the gap in between:
 * a directory can gain files while somebody answers.
 */
export interface LocationCheck {
  usable: boolean
  /** Why not, naming what was found. Absent when usable. */
  because?: string
}

export function checkLocation(path: string): LocationCheck {
  let entries: string[]
  try {
    const stats = statSync(path)
    if (!stats.isDirectory()) {
      return {
        usable: false,
        because:
          `${path} is a file. A project needs a directory of its own — give a path that does not ` +
          `exist yet and it will be created.`,
      }
    }
    entries = readdirSync(path)
  } catch {
    // Nothing there. The common case when creating: a path somebody typed that
    // nothing has made yet.
    return { usable: true }
  }

  if (entries.length > 0) {
    // **Named rather than counted.** "3 entries" tells somebody nothing about
    // whether they chose the wrong directory or the right one twice.
    const shown = entries.slice(0, 3).join(', ')
    const more = entries.length > 3 ? `, and ${entries.length - 3} more` : ''
    return {
      usable: false,
      because:
        `${path} already holds ${shown}${more}. Scaffolding writes a manifest, two instruction ` +
        `files and a first commit, so it only goes into a directory that is empty or not there ` +
        `yet — this one is somebody's already.`,
    }
  }
  return { usable: true }
}

/**
 * What goes in `.ai-memory.toml` when somebody asks for it.
 *
 * **The marker is the switch and it is TOML the service reads**, not a flag:
 * the image's boot hook exits when the file is absent, so without it nothing
 * listens, no lifecycle event is emitted, and the agent's sandbox is not
 * widened to reach the store.
 *
 * It carries its reasoning because a zero-byte file would switch memory on and
 * tell the next reader nothing about why — and the next reader is somebody
 * deciding whether to keep it.
 */
export function aiMemoryMarker(): string {
  return `# The marker is the switch: ai-memory is off in a project that does not carry
# this file, and nothing listens. Its presence is read at boot, by the service
# and by the hook that registers with the agent's CLI, so the container has to
# be restarted after it is added — and after it is removed.
#
# What it costs: prompts and tool excerpts are captured to disk, on this
# machine, for this project only. No LLM provider is configured, so nothing
# captured leaves the machine. Delete this file to switch it off.
[project]
project_strategy = "repo-root"
`
}
