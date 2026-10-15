/**
 * Which folder Open or Create asked to have prepared, handed from the window
 * that asked to the window that opens it (story opening-a-folder-writes-nothing).
 *
 * **Activation writes nothing on its own.** `code <folder>` used to activate the
 * extension and have startup() rename an old manifest and write .devcontainer,
 * CLAUDE.md and AGENTS.md into a project nobody had asked to prepare. Open and
 * Create both end in `vscode.openFolder`, and it is the new window that has to
 * do the preparing, so they leave a record in the extension's global state:
 * this folder, now. The new window prepares only for a record naming its own
 * folder and younger than HANDOVER_MS, and consumes it either way.
 *
 * Pure, so the decision is tested without an editor.
 */
export const HANDOVER_KEY = 'jvsl.agentContainer.handover'

/** Long enough for a window to open; short enough that a window that never did is forgotten. */
export const HANDOVER_MS = 2 * 60 * 1000

export interface Handover {
  folder: string
  at: number
}

const norm = (p: string) => p.replace(/\/+$/, '')

export function startupAction(handover: unknown, folder: string | undefined, now: number): 'prepare' | 'nothing' {
  if (folder === undefined || typeof handover !== 'object' || handover === null) return 'nothing'
  const h = handover as Partial<Handover>
  if (typeof h.folder !== 'string' || typeof h.at !== 'number') return 'nothing'
  if (norm(h.folder) !== norm(folder)) return 'nothing'
  if (now - h.at > HANDOVER_MS || now < h.at) return 'nothing'
  return 'prepare'
}
