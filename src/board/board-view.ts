import { columns, type Item } from './board-read.ts'

/**
 * The board's three views (story nmf.2, the-board-switches-between-views):
 * which items each shows, in which lanes and columns. Pure, so where an item
 * lands is a unit test rather than something to look at in an editor.
 *
 * **Tasks** is the day's work: the tasks, the debts' tasks included, from ready
 * to done. **Stories by epic** is the chain one level up: each agreed story and
 * debt in a lane for its epic, in the column refinement's agenda would put it
 * in. **All items** is the board as it was, every type in the stored states.
 *
 * A proposal, or anything deferred, is not work (FR-106), so only All items
 * shows it — as refine-candidates reads it: deferred or labelled `proposed`.
 */
export type ViewName = 'tasks' | 'stories' | 'all'

export const VIEWS: ReadonlyArray<{ name: ViewName; title: string }> = [
  { name: 'tasks', title: 'Tasks' },
  { name: 'stories', title: 'Stories by epic' },
  { name: 'all', title: 'All items' },
]

export const isView = (v: unknown): v is ViewName => VIEWS.some((x) => x.name === v)

export interface ViewColumn {
  key: string
  title: string
  items: Item[]
}

export interface Lane {
  /** The epic's id, or '' for the lane of what has no epic. */
  key: string
  title: string
  /** The lane's epic is closed: shown only while something in it is. */
  closed: boolean
  columns: ViewColumn[]
}

export interface BoardView {
  name: ViewName
  lanes: Lane[]
}

const isProposal = (i: Item) => i.status === 'deferred' || i.labels.includes('proposed')
/** The close reason refine-reject writes; work.jq's `rejected` reads the same prefix. */
const isRejected = (i: Item) => (i.closeReason ?? '').startsWith('Rejected in refinement:')
const isStoryLike = (i: Item) => i.type === 'feature' || i.debtKind !== undefined

const TASK_COLUMNS = [
  { key: 'ready', title: 'Ready' },
  { key: 'blocked', title: 'Blocked' },
  { key: 'in_progress', title: 'In progress' },
  { key: 'done', title: 'Done' },
] as const

const STORY_COLUMNS = [
  { key: 'no_task', title: 'No task' },
  { key: 'in_development', title: 'In development' },
  { key: 'awaiting_verification', title: 'Awaiting verification' },
  { key: 'done', title: 'Done' },
] as const

export function boardView(items: readonly Item[], view: ViewName): BoardView {
  if (view === 'all') {
    return { name: view, lanes: [{ key: '', title: '', closed: false, columns: columns(items) }] }
  }
  const closed = new Set(items.filter((i) => i.status === 'closed').map((i) => i.id))

  if (view === 'tasks') {
    const tasks = items.filter((i) => i.type === 'task' && !isProposal(i))
    const columnOf = (t: Item): string => {
      if (t.status === 'closed') return 'done'
      if (t.status === 'in_progress') return 'in_progress'
      if (t.status === 'blocked' || t.blockedBy.some((id) => !closed.has(id))) return 'blocked'
      return 'ready'
    }
    return {
      name: view,
      lanes: [{
        key: '', title: '', closed: false,
        columns: TASK_COLUMNS.map((c) => ({ ...c, items: tasks.filter((t) => columnOf(t) === c.key) })),
      }],
    }
  }

  // Stories by epic: the same buckets as refine-candidates. An agreed task is
  // open and neither deferred nor proposed; a done one is closed and not
  // rejected. board-view.test.ts runs the real script on the same export.
  const tasks = items.filter((i) => i.type === 'task')
  const openUnder = new Set(tasks.filter((t) => t.status !== 'closed' && !isProposal(t)).map((t) => t.parent))
  const doneUnder = new Set(tasks.filter((t) => t.status === 'closed' && !isRejected(t)).map((t) => t.parent))
  const columnOf = (s: Item): string => {
    if (s.status === 'closed') return 'done'
    if (openUnder.has(s.id)) return 'in_development'
    if (doneUnder.has(s.id)) return 'awaiting_verification'
    return 'no_task'
  }
  const stories = items.filter((i) => isStoryLike(i) && !isProposal(i))
  const byId = new Map(items.map((i) => [i.id, i]))
  const epicOf = (s: Item): string => {
    const parent = s.parent === undefined ? undefined : byId.get(s.parent)
    return parent !== undefined && parent.type === 'epic' && !isProposal(parent) ? parent.id : ''
  }
  // A lane for every open, agreed epic, and for a closed one still holding a
  // story: an open story never loses its place because its epic was closed.
  const epics = items.filter((i) => i.type === 'epic' && !isProposal(i) &&
    (i.status !== 'closed' || stories.some((s) => epicOf(s) === i.id)))
  const lane = (key: string, title: string, isClosed: boolean): Lane => ({
    key, title, closed: isClosed,
    columns: STORY_COLUMNS.map((c) => ({ ...c, items: stories.filter((s) => epicOf(s) === key && columnOf(s) === c.key) })),
  })
  return {
    name: view,
    lanes: [...epics.map((e) => lane(e.id, e.title, e.status === 'closed')), lane('', 'No epic', false)],
  }
}
