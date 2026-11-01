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
  /** bd's 0 to 4 as text, '' when unset (story nmf.3). */
  priority: string
}

/**
 * One field of the filter (story nmf.4): a row passes when it has none of the
 * excluded values and any of the included ones — all of them, for tags with
 * `all` on. Nothing included means any. An exclude wins over an include.
 */
export interface FieldFilter {
  include: string[]
  exclude: string[]
  /** Tags only: type and state hold one value per item, so they ignore it. */
  all: boolean
}

export interface Filter {
  /** Matched against the ID and the title, ignoring case, as plain text. */
  text: string
  type: FieldFilter
  state: FieldFilter
  tag: FieldFilter
  /** By the name shown, P0 to P4. An item with no priority has no value to match (story dox.3). */
  priority: FieldFilter
  /**
   * Whether closed rows can match (story nmf.1). Off, a closed row is shown
   * only as context above an open one, or when the state filter names Closed.
   */
  showClosed: boolean
}

/**
 * What the backlog shows for a filter: every row that matches, plus each of
 * its ancestors, so a match is never shown out of its place. The ancestors
 * that do not match are `context`, and the page dims them.
 */
export function visibleIds(rows: readonly FilterRow[], filter: Filter): { shown: Set<string>; context: Set<string> } {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const text = filter.text.trim().toLowerCase()
  const passes = (values: string[], f: FieldFilter, many: boolean): boolean =>
    !values.some((v) => f.exclude.includes(v)) &&
    (f.include.length === 0 || (many && f.all ? f.include.every((v) => values.includes(v)) : f.include.some((v) => values.includes(v))))
  const askedClosed = filter.state.include.includes('Closed') && !filter.state.exclude.includes('Closed')
  const matches = (r: FilterRow): boolean =>
    (text === '' || r.id.toLowerCase().includes(text) || r.title.toLowerCase().includes(text)) &&
    passes([r.type], filter.type, false) &&
    passes([r.state], filter.state, false) &&
    passes(r.tags, filter.tag, true) &&
    passes(r.priority === '' ? [] : ['P' + r.priority], filter.priority, false) &&
    (filter.showClosed || askedClosed || r.state !== 'Closed')
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
 * How many closed rows the "Show closed" toggle alone is hiding: those that
 * match every other part of the filter (story nmf.1). Zero when the toggle is
 * on or the state filter names Closed. Self-contained, like visibleIds, and
 * for the same reason: the page runs this source.
 */
export function hiddenClosed(rows: readonly FilterRow[], filter: Filter): number {
  if (filter.showClosed || (filter.state.include.includes('Closed') && !filter.state.exclude.includes('Closed'))) return 0
  const text = filter.text.trim().toLowerCase()
  const passes = (values: string[], f: FieldFilter, many: boolean): boolean =>
    !values.some((v) => f.exclude.includes(v)) &&
    (f.include.length === 0 || (many && f.all ? f.include.every((v) => values.includes(v)) : f.include.some((v) => values.includes(v))))
  const matches = (r: FilterRow): boolean =>
    (text === '' || r.id.toLowerCase().includes(text) || r.title.toLowerCase().includes(text)) &&
    passes([r.type], filter.type, false) &&
    passes([r.state], filter.state, false) &&
    passes(r.tags, filter.tag, true) &&
    passes(r.priority === '' ? [] : ['P' + r.priority], filter.priority, false)
  // A closed row above an open match is on screen anyway, as context: not hidden.
  const byId = new Map(rows.map((r) => [r.id, r]))
  const above = new Set<string>()
  for (const r of rows) {
    if (r.state === 'Closed' || !matches(r)) continue
    let up = r.parent === undefined ? undefined : byId.get(r.parent)
    while (up !== undefined && !above.has(up.id)) {
      above.add(up.id)
      up = up.parent === undefined ? undefined : byId.get(up.parent)
    }
  }
  return rows.filter((r) => r.state === 'Closed' && matches(r) && !above.has(r.id)).length
}

/**
 * The backlog's order: depth first, with siblings sorted by the column.
 * **Sorting is within each level**, so a child always follows its parent and
 * precedes the parent's next sibling. Ties keep their original order. A row
 * whose parent is absent sits at the top level.
 */
export function orderedIds(
  rows: readonly FilterRow[],
  column: 'id' | 'title' | 'state' | 'tags' | 'priority',
  direction: 'asc' | 'desc',
): string[] {
  const ids = new Set(rows.map((r) => r.id))
  const index = new Map(rows.map((r, i) => [r.id, i]))
  // An unset priority sorts after every one bd allows (0 to 4): the comparison
  // below is numeric, and punctuation such as '~' would sort before the digits.
  const key = (r: FilterRow): string =>
    column === 'tags' ? r.tags.join(' ') : column === 'priority' ? (r.priority === '' ? '99' : r.priority) : r[column]
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
