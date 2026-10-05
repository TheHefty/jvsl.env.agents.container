/**
 * What the sidebar view shows, as a function of what is on disk.
 *
 * **The tree provider is a shell over this.** A test that asserts a `TreeItem`
 * was constructed is a test of the constructor; what can be wrong here is which
 * rows appear and what they say.
 */

export interface ViewState {
  /**
   * The stacks the extension carries. **Empty means a broken installation**, not
   * an uninitialised submodule — this extension carries them and there is no
   * submodule to initialise.
   */
  stacksAvailable: readonly string[]
  /**
   * Whether a folder is open at all.
   *
   * **The view returned nothing when there was none**, so it was invisible
   * exactly when somebody has nothing open and most needs a way in. With no
   * folder it shows the two entries instead.
   */
  folderOpen?: boolean
  /** A blocking host problem, shown before anything is offered. */
  hostProblem?: string
  /** The parsed manifest, or null when there is none. */
  manifest: Record<string, unknown> | null
  /** What the last build in this session did, if there was one. */
  lastBuild?: 'ok' | 'failed' | 'cancelled'
}

export interface Row {
  kind: 'stack' | 'limit' | 'note' | 'empty' | 'uninitialised' | 'build' | 'entry' | 'problem'
  label: string
  detail: string
  /**
   * The command an entry runs.
   *
   * **Carried rather than written beside the row**, so a command that is removed
   * takes its entry with it. The story is explicit that an entry for a
   * capability that does not exist is worse than no entry: it reports a defect
   * where there is only an absence.
   */
  command?: string
}

const LIMIT_ORDER = ['memory', 'memorySwap', 'cpus'] as const

/**
 * The rows, in the order they are shown.
 *
 * Three states are deliberately distinct, because collapsing any two of them
 * sends somebody to the wrong place:
 *
 * - **no stacks available** — `.code-server/` is empty until the submodule is
 *   checked out, and an empty tree reads as a broken extension rather than a
 *   missing checkout;
 * - **no manifest** — nothing has been configured yet, and the thing to do is
 *   answer the questions;
 * - **a manifest selecting no stacks** — a real selection that produces the core
 *   image, and reporting it as unconfigured would send somebody to answer
 *   questions they have already answered.
 */
export function viewItems(state: ViewState): Row[] {
  // **Before anything is offered.** The panel is the first thing anybody sees,
  // so a host that cannot build says so here rather than three clicks later,
  // inside a build, as a message about something else.
  const problem: Row[] = state.hostProblem === undefined
    ? []
    : [{ kind: 'problem', label: 'This host cannot build yet', detail: state.hostProblem }]

  if (state.folderOpen === false) {
    return [
      ...problem,
      {
        kind: 'entry',
        label: 'Create a project',
        detail: 'A new directory, the stacks it needs, and a container',
        command: 'jvsl.agentContainer.create',
      },
      {
        kind: 'entry',
        label: 'Open a project',
        detail: 'Pick a folder; it is built if its image is missing',
        command: 'jvsl.agentContainer.open',
      },
    ]
  }

  if (state.stacksAvailable.length === 0) {
    return [
      {
        kind: 'uninitialised',
        label: 'This installation is incomplete',
        detail: 'the extension carries the stacks — reinstall it',
      },
    ]
  }

  if (state.manifest === null) {
    return [
      {
        kind: 'empty',
        label: 'Not configured yet',
        detail: 'run Agent Container: Configure Stacks and Limits',
      },
    ]
  }

  const rows: Row[] = []
  for (const stack of state.stacksAvailable) {
    const version = state.manifest[stack]
    if (typeof version === 'string') {
      rows.push({ kind: 'stack', label: stack, detail: version })
    }
  }
  if (rows.length === 0) {
    rows.push({ kind: 'note', label: 'No stacks selected', detail: 'the core image alone' })
  }

  const limits = (state.manifest.limits ?? {}) as Record<string, unknown>
  for (const key of LIMIT_ORDER) {
    const value = limits[key]
    if (value !== undefined && value !== null) {
      rows.push({ kind: 'limit', label: key, detail: String(value) })
    }
  }

  // **A failed build leaves its state here rather than in a notification.** The
  // terminal holds the whole error, which is where the cause is; a popup saying
  // "the build failed" repeats what the screen says and has to be dismissed
  // before the useful text can be read. And a cancelled build says cancelled:
  // reporting it as a failure makes "I stopped it" look like "it broke".
  if (state.lastBuild) {
    rows.push({ kind: 'build', label: 'last build', detail: state.lastBuild })
  }

  return rows
}
