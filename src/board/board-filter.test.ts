import { test } from 'node:test'
import assert from 'node:assert/strict'

import { orderedIds, visibleIds, type FilterRow } from './board-filter.ts'

const r = (id: string, parent: string | undefined, o: Partial<FilterRow> = {}): FilterRow => ({
  id, parent, type: 'Task', state: 'Open', tags: [], title: id, ...o,
})

// e1 > s1 > (t1, t2);  e1 > s2;  orphan o1
const ROWS: FilterRow[] = [
  r('e1', undefined, { type: 'Epic', title: 'Epic one' }),
  r('s1', 'e1', { type: 'User Story', title: 'Board' }),
  r('t1', 's1', { title: 'Zeta task', state: 'Closed', tags: ['defect'] }),
  r('t2', 's1', { title: 'Alpha task', state: 'In progress' }),
  r('s2', 'e1', { type: 'User Story', title: 'Another', state: 'Proposal', tags: ['Proposal'] }),
  r('o1', undefined, { type: 'Bug', title: 'Orphan <script>', tags: ['hotfix'] }),
]
const NONE = { text: '', type: '', state: '', tag: '' }

test('with no filter everything is shown and nothing is context', () => {
  const v = visibleIds(ROWS, NONE)
  assert.deepEqual([...v.shown].sort(), ROWS.map((x) => x.id).sort())
  assert.deepEqual([...v.context], [])
})

test('a match keeps every ancestor, and the ancestors that do not match are context', () => {
  const v = visibleIds(ROWS, { ...NONE, text: 'zeta' })
  assert.deepEqual([...v.shown].sort(), ['e1', 's1', 't1'])
  assert.deepEqual([...v.context].sort(), ['e1', 's1'])
})

test('type, state and tag filter, and all of them must hold', () => {
  assert.deepEqual([...visibleIds(ROWS, { ...NONE, type: 'Bug' }).shown], ['o1'])
  assert.deepEqual([...visibleIds(ROWS, { ...NONE, state: 'In progress' }).shown].sort(), ['e1', 's1', 't2'])
  assert.deepEqual([...visibleIds(ROWS, { ...NONE, tag: 'defect', state: 'Open' }).shown], [])
})

test('the keyword matches the ID and the title, ignoring case, as text', () => {
  assert.deepEqual([...visibleIds(ROWS, { ...NONE, text: 'T2' }).shown].sort(), ['e1', 's1', 't2'])
  assert.deepEqual([...visibleIds(ROWS, { ...NONE, text: '<script>' }).shown], ['o1'])
})

const isTreeOrder = (order: string[]) => {
  // Every child comes after its parent and before the parent's next sibling.
  const pos = new Map(order.map((id, i) => [id, i]))
  const subtreeEnd = (id: string): number => {
    const kids = ROWS.filter((x) => x.parent === id).map((x) => subtreeEnd(x.id))
    return Math.max(pos.get(id)!, ...kids)
  }
  return ROWS.every((x) => {
    if (!x.parent) return true
    const p = pos.get(x.parent)!, me = pos.get(x.id)!
    if (me <= p) return false
    const sibs = ROWS.filter((y) => y.parent === ROWS.find((z) => z.id === x.parent)!.parent && y.id !== x.parent)
    return sibs.every((s) => pos.get(s.id)! < p || pos.get(s.id)! > subtreeEnd(x.parent!))
  })
}

test('sorting never separates a child from its parent, for every column and direction', () => {
  for (const column of ['id', 'title', 'state', 'tags'] as const) {
    for (const dir of ['asc', 'desc'] as const) {
      const order = orderedIds(ROWS, column, dir)
      assert.deepEqual([...order].sort(), ROWS.map((x) => x.id).sort(), `${column} ${dir}: every row once`)
      assert.ok(isTreeOrder(order), `${column} ${dir}: ${order.join(' ')}`)
    }
  }
})

test('siblings are sorted by the column, and the second direction reverses them', () => {
  assert.deepEqual(orderedIds(ROWS, 'title', 'asc'), ['e1', 's2', 's1', 't2', 't1', 'o1'])
  assert.deepEqual(orderedIds(ROWS, 'title', 'desc'), ['o1', 'e1', 's1', 't1', 't2', 's2'])
})

test('the functions are self-contained, so the page can run the same source', () => {
  for (const f of [visibleIds, orderedIds]) {
    const again = new Function(`return (${f.toString()})`)() as typeof f
    assert.equal(typeof again, 'function')
  }
  const again = new Function(`return (${orderedIds.toString()})`)() as typeof orderedIds
  assert.deepEqual(again(ROWS, 'id', 'asc'), orderedIds(ROWS, 'id', 'asc'))
})
