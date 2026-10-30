import { byPriority, columns, type Item } from './board-read.ts'

/**
 * The board's three views (story nmf.2, the-board-switches-between-views):
 * which items each shows, in which lanes and columns. Pure, so where an item
 * lands is a unit test rather than something to look at in an editor.
 *
 * **Tasks** is the day's work: the tasks, the debts' tasks included, from ready
 * to done. **Tasks by story** is the same tasks in a lane for each story or
 * debt they belong to (story nmf.5). **Stories by epic** is the chain one level up: each agreed story and
 * debt in a lane for its epic, in the column refinement's agenda would put it
 * in. **All items** is the board as it was, every type in the stored states.
 *
 * A proposal, or anything deferred, is not work (FR-106), so only All items
 * shows it — as refine-candidates reads it: deferred or labelled `proposed`.
 */
export type ViewName = 'tasks' | 'by-story' | 'stories' | 'all'

export const VIEWS: ReadonlyArray<{ name: ViewName; title: string }> = [
  { name: 'tasks', title: 'Tasks' },
  { name: 'by-story', title: 'Tasks by story' },
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
  const v = unordered(items, view)
  // Within each column, by priority (story nmf.3).
  for (const lane of v.lanes) for (const c of lane.columns) c.items = byPriority(c.items, (i) => i)
  return v
}

function unordered(items: readonly Item[], view: ViewName): BoardView {
  if (view === 'all') {
    return { name: view, lanes: [{ key: '', title: '', closed: false, columns: columns(items) }] }
  }
  const closed = new Set(items.filter((i) => i.status === 'closed').map((i) => i.id))

  if (view === 'tasks' || view === 'by-story') {
    const tasks = items.filter((i) => i.type === 'task' && !isProposal(i))
    const columnOf = (t: Item): string => {
      if (t.status === 'closed') return 'done'
      if (t.status === 'in_progress') return 'in_progress'
      if (t.status === 'blocked' || t.blockedBy.some((id) => !closed.has(id))) return 'blocked'
      return 'ready'
    }
    const taskColumns = (list: readonly Item[]): ViewColumn[] =>
      TASK_COLUMNS.map((c) => ({ ...c, items: list.filter((t) => columnOf(t) === c.key) }))
    if (view === 'by-story') return { name: view, lanes: storyLanes(items, tasks, taskColumns) }
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
  const columnOf = storyBucket(items)
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

/**
 * The bucket refine-candidates puts a story or debt in. An agreed task is open
 * and neither deferred nor proposed; a done one is closed and not rejected.
 */
function storyBucket(items: readonly Item[]): (s: Item) => string {
  const tasks = items.filter((i) => i.type === 'task')
  const openUnder = new Set(tasks.filter((t) => t.status !== 'closed' && !isProposal(t)).map((t) => t.parent))
  const doneUnder = new Set(tasks.filter((t) => t.status === 'closed' && !isRejected(t)).map((t) => t.parent))
  return (s) => {
    if (s.status === 'closed') return 'done'
    if (openUnder.has(s.id)) return 'in_development'
    if (doneUnder.has(s.id)) return 'awaiting_verification'
    return 'no_task'
  }
}

export interface ChainMark {
  /** A story or debt whose tasks are done and none open, as refinement's agenda lists it. */
  awaitingVerification?: true
  /** A task the planning can pick, as planning-brief's Ready lists it. */
  ready?: true
  /** A ready task with no done criterion, which the brief marks so the planning asks for one. */
  noCriterion?: true
}

/**
 * Where each item stands in the chain (story nmf.3), by the ceremonies' own
 * rules: board-view.test.ts runs planning-brief and refine-candidates on the
 * same export and requires the same ids.
 */
export function chainMarks(items: readonly Item[]): Map<string, ChainMark> {
  const bucket = storyBucket(items)
  const closed = new Set(items.filter((i) => i.status === 'closed').map((i) => i.id))
  const marks = new Map<string, ChainMark>()
  for (const i of items) {
    if (isProposal(i) || i.labels.includes('journal')) continue
    if (isStoryLike(i) && bucket(i) === 'awaiting_verification') marks.set(i.id, { awaitingVerification: true })
    if (i.type === 'task' && i.status === 'open' && !i.blockedBy.some((id) => !closed.has(id))) {
      marks.set(i.id, { ready: true, ...((i.acceptance ?? '') === '' ? { noCriterion: true as const } : {}) })
    }
  }
  return marks
}

/**
 * Tasks by story's lanes (story nmf.5): one per story or debt holding a task,
 * titled Epic › Story, in the story's priority order, and a last "No story"
 * lane for a task whose parent is neither — none, an epic, another task.
 * A closed story's lane is marked, so the page hides it while Show closed is
 * off and nothing open is left in it.
 */
function storyLanes(items: readonly Item[], tasks: readonly Item[], taskColumns: (list: readonly Item[]) => ViewColumn[]): Lane[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const storyOf = (t: Item): Item | undefined => {
    const parent = t.parent === undefined ? undefined : byId.get(t.parent)
    return parent !== undefined && isStoryLike(parent) ? parent : undefined
  }
  const stories = byPriority(items.filter((i) => isStoryLike(i) && tasks.some((t) => storyOf(t) === i)), (i) => i)
  const title = (s: Item) => {
    const epic = s.parent === undefined ? undefined : byId.get(s.parent)
    return epic !== undefined && epic.type === 'epic' ? `${epic.title} › ${s.title}` : s.title
  }
  const lanes: Lane[] = stories.map((s) => ({
    key: s.id, title: title(s), closed: s.status === 'closed', columns: taskColumns(tasks.filter((t) => storyOf(t) === s)),
  }))
  const loose = tasks.filter((t) => storyOf(t) === undefined)
  if (loose.length > 0) lanes.push({ key: '', title: 'No story', closed: false, columns: taskColumns(loose) })
  return lanes
}
