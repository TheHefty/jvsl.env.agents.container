/**
 * What the board shows, as a function of what `bd export` printed.
 *
 * **Measured against bd v1.3.1, not read from its documentation.** One JSON
 * object per line; issues carry `_type: "issue"`; a long field that is empty is
 * absent rather than null; the hierarchy is a `parent-child` dependency and
 * blocking is a `blocks` dependency. `bd list --json` has a `parent` field, but
 * not the acceptance criteria, design or close reason, so the export is read
 * instead: one call returns everything the page shows.
 *
 * Pure, so every decision about what goes where is a unit test rather than
 * something to look at in an editor.
 */

export type DebtKind = 'hotfix' | 'shortcut' | 'defect'

export interface Item {
  id: string
  title: string
  status: string
  type: string
  labels: string[]
  description?: string
  acceptance?: string
  design?: string
  closeReason?: string
  parent?: string
  /** The ids this item waits on through a `blocks` dependency. */
  blockedBy: string[]
  debtKind?: DebtKind
}

const DEBT_KINDS: readonly DebtKind[] = ['hotfix', 'shortcut', 'defect']

interface Dependency {
  depends_on_id?: unknown
  type?: unknown
}

const text = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

/**
 * Parses the export. A line that is not JSON is an error naming its line,
 * because a board that silently drops what it could not read shows a project
 * that is smaller than the real one.
 */
export function parseExport(jsonl: string): Item[] {
  const items: Item[] = []
  jsonl.split('\n').forEach((line, index) => {
    if (line.trim() === '') return
    let row: Record<string, unknown>
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch (error) {
      throw new Error(`bd export line ${index + 1} is not JSON: ${String(error)}`)
    }
    if (row['_type'] !== undefined && row['_type'] !== 'issue') return
    const deps = Array.isArray(row['dependencies']) ? (row['dependencies'] as Dependency[]) : []
    const labels = Array.isArray(row['labels']) ? row['labels'].filter((l): l is string => typeof l === 'string') : []
    const type = text(row['issue_type']) ?? 'task'
    const kind = type === 'bug' ? DEBT_KINDS.find((k) => labels.includes(k)) : undefined
    items.push({
      id: String(row['id']),
      title: text(row['title']) ?? '(untitled)',
      status: text(row['status']) ?? 'open',
      type,
      labels,
      description: text(row['description']),
      acceptance: text(row['acceptance_criteria']),
      design: text(row['design']),
      closeReason: text(row['close_reason']),
      parent: text(deps.find((d) => d.type === 'parent-child')?.depends_on_id),
      blockedBy: deps.filter((d) => d.type === 'blocks').map((d) => String(d.depends_on_id)),
      ...(kind === undefined ? {} : { debtKind: kind }),
    })
  })
  return items
}

export type ColumnKey = 'proposed' | 'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed'

export interface Column {
  key: ColumnKey
  title: string
  items: Item[]
}

const COLUMNS: ReadonlyArray<{ key: ColumnKey; title: string }> = [
  { key: 'proposed', title: 'Proposals' },
  { key: 'open', title: 'Open' },
  { key: 'in_progress', title: 'In progress' },
  { key: 'blocked', title: 'Blocked' },
  { key: 'deferred', title: 'Deferred' },
  { key: 'closed', title: 'Closed' },
]

/**
 * The column an item belongs in.
 *
 * **A proposal is its own column whatever its stored state**, because FR-106
 * makes it not work: it is deferred only so `bd ready` never lists it.
 * **Blocked is derived**, an open item waiting on one that is not closed: a
 * blocker that was closed blocks nothing, whatever was stored.
 */
function columnOf(item: Item, closed: ReadonlySet<string>): ColumnKey {
  if (item.labels.includes('proposed')) return 'proposed'
  if (item.status === 'closed') return 'closed'
  if (item.status === 'deferred') return 'deferred'
  if (item.status === 'in_progress') return 'in_progress'
  if (item.status === 'blocked') return 'blocked'
  if (item.blockedBy.some((id) => !closed.has(id))) return 'blocked'
  return 'open'
}

export function columns(items: readonly Item[]): Column[] {
  const closed = new Set(items.filter((i) => i.status === 'closed').map((i) => i.id))
  return COLUMNS.map(({ key, title }) => ({
    key,
    title,
    items: items.filter((i) => columnOf(i, closed) === key),
  }))
}

export interface Node {
  item: Item
  children: Node[]
}

/**
 * The hierarchy, in export order. An item whose parent is absent from the
 * export stays at the root rather than vanishing.
 */
export function tree(items: readonly Item[]): Node[] {
  const nodes = new Map(items.map((item) => [item.id, { item, children: [] as Node[] }]))
  const roots: Node[] = []
  for (const node of nodes.values()) {
    const parent = node.item.parent === undefined ? undefined : nodes.get(node.item.parent)
    if (parent === undefined) roots.push(node)
    else parent.children.push(node)
  }
  return roots
}

/**
 * How each bd type is shown, in Azure DevOps's names and colours (FR-118 as
 * amended on 2026-10-07). **Only the name shown changes**: bd still stores a
 * story as a `feature`. A type this table does not know keeps its own name and
 * a neutral colour, never folded into one it is not.
 */
const LOOKS: Readonly<Record<string, { name: string; colour: string }>> = {
  epic: { name: 'Epic', colour: '#FF7B00' },
  feature: { name: 'User Story', colour: '#009CCC' },
  task: { name: 'Task', colour: '#F2CB1D' },
  bug: { name: 'Bug', colour: '#CC293D' },
}

export function typeLook(type: string): { name: string; colour: string } {
  return LOOKS[type] ?? { name: type, colour: '#8A8886' }
}

export interface BacklogRow {
  item: Item
  depth: number
  hasChildren: boolean
}

/**
 * The backlog grid: the tree, depth first, one row per item. Every item from
 * the export appears exactly once, because the rows are the tree's nodes and
 * the tree holds each item once.
 */
export function backlogRows(items: readonly Item[]): BacklogRow[] {
  const rows: BacklogRow[] = []
  const walk = (nodes: readonly Node[], depth: number) => {
    for (const n of nodes) {
      rows.push({ item: n.item, depth, hasChildren: n.children.length > 0 })
      walk(n.children, depth + 1)
    }
  }
  walk(tree(items), 0)
  return rows
}
