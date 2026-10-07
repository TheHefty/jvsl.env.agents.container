/**
 * The backlog's filter and sort, as two pure functions (FR-118, amended on
 * 2026-10-07).
 *
 * **The page runs these same functions.** Their source is embedded in the
 * page's one nonce'd script with Function.prototype.toString, so what the tests
 * here prove is what the page executes. That is why each is self-contained: no
 * import, no helper outside its own body, nothing a bundler could rename.
 */

export interface FilterRow {
  id: string
  parent: string | undefined
  /** The type's name as shown: Epic, User Story, Task, Bug. */
  type: string
  /** The state as shown: Proposal, Open, In progress, … */
  state: string
  tags: string[]
  title: string
}

export interface Filter {
  /** Matched against the ID and the title, ignoring case, as plain text. */
  text: string
  /** '' means any. */
  type: string
  state: string
  tag: string
}

/**
 * What the backlog shows for a filter: every row that matches, plus each of
 * its ancestors, so a match is never shown out of its place. The ancestors
 * that do not match are `context`, and the page dims them.
 */
export function visibleIds(rows: readonly FilterRow[], filter: Filter): { shown: Set<string>; context: Set<string> } {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const text = filter.text.trim().toLowerCase()
  const matches = (r: FilterRow): boolean =>
    (text === '' || r.id.toLowerCase().includes(text) || r.title.toLowerCase().includes(text)) &&
    (filter.type === '' || r.type === filter.type) &&
    (filter.state === '' || r.state === filter.state) &&
    (filter.tag === '' || r.tags.includes(filter.tag))
  const shown = new Set<string>()
  const context = new Set<string>()
  for (const r of rows) {
    if (!matches(r)) continue
    shown.add(r.id)
    context.delete(r.id)
    let up = r.parent === undefined ? undefined : byId.get(r.parent)
    while (up !== undefined && !shown.has(up.id)) {
      shown.add(up.id)
      if (!matches(up)) context.add(up.id)
      up = up.parent === undefined ? undefined : byId.get(up.parent)
    }
  }
  return { shown, context }
}

/**
 * The backlog's order: depth first, with siblings sorted by the column.
 * **Sorting is within each level**, so a child always follows its parent and
 * precedes the parent's next sibling. Ties keep their original order. A row
 * whose parent is absent sits at the top level.
 */
export function orderedIds(
  rows: readonly FilterRow[],
  column: 'id' | 'title' | 'state' | 'tags',
  direction: 'asc' | 'desc',
): string[] {
  const ids = new Set(rows.map((r) => r.id))
  const index = new Map(rows.map((r, i) => [r.id, i]))
  const key = (r: FilterRow): string => (column === 'tags' ? r.tags.join(' ') : r[column])
  const sign = direction === 'asc' ? 1 : -1
  const children = new Map<string, FilterRow[]>()
  const roots: FilterRow[] = []
  for (const r of rows) {
    if (r.parent !== undefined && ids.has(r.parent)) {
      const list = children.get(r.parent) ?? []
      list.push(r)
      children.set(r.parent, list)
    } else {
      roots.push(r)
    }
  }
  const sorted = (list: FilterRow[]): FilterRow[] =>
    [...list].sort(
      (a, b) =>
        sign * key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: 'base' }) ||
        index.get(a.id)! - index.get(b.id)!,
    )
  const out: string[] = []
  const walk = (list: FilterRow[]): void => {
    for (const r of sorted(list)) {
      out.push(r.id)
      walk(children.get(r.id) ?? [])
    }
  }
  walk(roots)
  return out
}
