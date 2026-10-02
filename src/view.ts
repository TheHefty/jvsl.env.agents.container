/**
 * What the sidebar view shows, as a function of what is on disk.
 *
 * **The tree provider is a shell over this.** A test that asserts a `TreeItem`
 * was constructed is a test of the constructor; what can be wrong here is which
 * rows appear and what they say.
 */

export interface ViewState {
  /** The stacks the template has. Empty means the submodule is not checked out. */
  stacksAvailable: readonly string[]
  /** The parsed manifest, or null when there is none. */
  manifest: Record<string, unknown> | null
}

export interface Row {
  kind: 'stack' | 'limit' | 'note' | 'empty' | 'uninitialised'
  label: string
  detail: string
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
  if (state.stacksAvailable.length === 0) {
    return [
      {
        kind: 'uninitialised',
        label: 'Template not checked out',
        detail: 'run: git submodule update --init',
      },
    ]
  }

  if (state.manifest === null) {
    return [
      {
        kind: 'empty',
        label: 'Not configured yet',
        detail: 'run Dev Container: Configure Stacks and Limits',
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

  return rows
}
