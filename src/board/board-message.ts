import { isView, type ViewName } from './board-view.ts'

/** Where the board view last chosen is kept: the workspace's own memory, never the tracker. */
export const VIEW_KEY = 'jvsl.agentContainer.boardView'

export interface BoardMessageDeps {
  /** Reads the tracker again and renders the page. */
  refresh(): void
  /** Keeps the chosen view for this workspace. */
  remember(view: ViewName): void
}

/**
 * What the Work view's page may ask (story nmf.2): read again, or remember a
 * view. **Nothing else is acted on**, and a view outside the three is ignored,
 * so the page cannot be made to write anything — the view only reads.
 */
export function onBoardMessage(message: unknown, deps: BoardMessageDeps): void {
  if (message === null || typeof message !== 'object') return
  const m = message as { type?: unknown; view?: unknown }
  if (m.type === 'refresh') deps.refresh()
  else if (m.type === 'view' && isView(m.view)) deps.remember(m.view)
}

/** The view to open on: the one remembered, or All items, the board as it was. */
export function rememberedView(stored: unknown): ViewName {
  return isView(stored) ? stored : 'all'
}
