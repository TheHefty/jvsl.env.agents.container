import { isView, type ViewName } from './board-view.ts'

/** Where the board view last chosen is kept: the workspace's own memory, never the tracker. */
export const VIEW_KEY = 'jvsl.agentContainer.boardView'

export interface BoardMessageDeps {
  /** Reads the tracker again and renders the page. */
  refresh(): void
  /** Keeps the chosen view for this workspace. */
  remember(view: ViewName): void
  /** Puts an item's whole ID on the editor's clipboard (story dox.4). */
  copy(id: string): void
  /** Whether the page on screen shows this item. */
  known(id: string): boolean
}

/**
 * What the Work view's page may ask (stories nmf.2 and dox.4): read again,
 * remember a view, or copy the ID of an item it shows. **Nothing else is acted
 * on**, and a view or an ID it does not know is ignored, so the page cannot be
 * made to write anything to the tracker, or put other text on the clipboard.
 */
export function onBoardMessage(message: unknown, deps: BoardMessageDeps): void {
  if (message === null || typeof message !== 'object') return
  const m = message as { type?: unknown; view?: unknown; id?: unknown }
  if (m.type === 'refresh') deps.refresh()
  else if (m.type === 'view' && isView(m.view)) deps.remember(m.view)
  else if (m.type === 'copy' && typeof m.id === 'string' && deps.known(m.id)) deps.copy(m.id)
}

/** The view to open on: the one remembered, or All items, the board as it was. */
export function rememberedView(stored: unknown): ViewName {
  return isView(stored) ? stored : 'all'
}
