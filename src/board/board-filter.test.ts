import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hiddenClosed, orderedIds, visibleIds, type FilterRow } from './board-filter.ts'

const r = (id: string, parent: string | undefined, o: Partial<FilterRow> = {}): FilterRow => ({
  id, parent, type: 'Task', state: 'Open', tags: [], title: id, priority: '', ...o,
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
// The tests below were written before closed items were hidden: they keep their
// meaning with the toggle on. The ones after them hold the default, off.
// A field with nothing chosen keeps everything; inc and exc choose values.
const ANY = { include: [] as string[], exclude: [] as string[], all: false }
const inc = (...v: string[]) => ({ ...ANY, include: v })
const exc = (...v: string[]) => ({ ...ANY, exclude: v })
const NONE = { text: '', type: ANY, state: ANY, tag: ANY, priority: ANY, showClosed: true }

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
  assert.deepEqual([...visibleIds(ROWS, { ...NONE, type: inc('Bug') }).shown], ['o1'])
  assert.deepEqual([...visibleIds(ROWS, { ...NONE, state: inc('In progress') }).shown].sort(), ['e1', 's1', 't2'])
  assert.deepEqual([...visibleIds(ROWS, { ...NONE, tag: inc('defect'), state: inc('Open') }).shown], [])
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

/* eslint-disable @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call --
   rebuilding each function from its own source is the claim under test: the page runs it that way. */
test('the functions are self-contained, so the page can run the same source', () => {
  for (const f of [visibleIds, orderedIds]) {
    const again = new Function(`return (${f.toString()})`)() as typeof f
    assert.equal(typeof again, 'function')
  }
  const again = new Function(`return (${orderedIds.toString()})`)() as typeof orderedIds
  assert.deepEqual(again(ROWS, 'id', 'asc'), orderedIds(ROWS, 'id', 'asc'))
})
/* eslint-enable @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call */

// --- closed work stays out of the way (story nmf.1, task nmf.1.1)
//
// On 2026-10-30, 210 of this tracker's 233 items were closed, and they filled
// the board's Closed column and the backlog.

const HIDE = { ...NONE, showClosed: false }
// e2 (closed) > s3 (closed) > t3 (open);  e2 > t4 (closed)
const LIVE: FilterRow[] = [
  ...ROWS,
  r('e2', undefined, { type: 'Epic', title: 'Finished epic', state: 'Closed' }),
  r('s3', 'e2', { type: 'User Story', title: 'Finished story', state: 'Closed' }),
  r('t3', 's3', { title: 'A task still open' }),
  r('t4', 'e2', { title: 'Closed alpha', state: 'Closed' }),
]

test('closed items are hidden by default', () => {
  const v = visibleIds(LIVE, HIDE)
  assert.equal(v.shown.has('t1'), false)
  assert.equal(v.shown.has('t4'), false)
  assert.ok(v.shown.has('t2') && v.shown.has('o1'))
})

test('and shown when the developer asks for them', () => {
  const v = visibleIds(LIVE, { ...HIDE, showClosed: true })
  assert.ok(v.shown.has('t1') && v.shown.has('t4'))
})

test('an open item under a closed parent stays, with its closed ancestors as context', () => {
  const v = visibleIds(LIVE, HIDE)
  assert.ok(v.shown.has('t3'))
  assert.ok(v.shown.has('s3') && v.context.has('s3'), 'the closed story is shown above it, dimmed')
  assert.ok(v.shown.has('e2') && v.context.has('e2'))
})

test('the hidden count is what the toggle alone hides', () => {
  // t1, e2, s3, t4 are closed; e2 and s3 are shown anyway, as context.
  assert.equal(hiddenClosed(LIVE, HIDE), 2)
  // Under a text filter it counts only the closed rows that filter would show.
  assert.equal(hiddenClosed(LIVE, { ...HIDE, text: 'alpha' }), 1)
  // Matches only: an ancestor brought in as context is not something the toggle hid.
  const matched = (f: typeof HIDE) => { const v = visibleIds(LIVE, f); return [...v.shown].filter((id) => !v.context.has(id)).length }
  assert.equal(matched({ ...HIDE, text: 'alpha', showClosed: true }) - matched({ ...HIDE, text: 'alpha' }), 1,
    'it agrees with the matches turning the toggle on adds')
  assert.equal(hiddenClosed(LIVE, { ...HIDE, showClosed: true }), 0)
})

test('an explicit State: Closed shows closed items with the toggle off', () => {
  const v = visibleIds(LIVE, { ...HIDE, state: inc('Closed') })
  assert.ok(v.shown.has('t1') && v.shown.has('t4'))
  assert.equal(hiddenClosed(LIVE, { ...HIDE, state: inc('Closed') }), 0)
})

test('sorting by priority puts unset last, and keeps each child under its parent (story nmf.3)', () => {
  const rows = [
    r('e', undefined, { priority: '2' }),
    r('a', 'e', { priority: '' }),
    r('b', 'e', { priority: '0' }),
    r('c', 'e', { priority: '3' }),
    r('c1', 'c', { priority: '1' }),
  ]
  assert.deepEqual(orderedIds(rows, 'priority', 'asc'), ['e', 'b', 'c', 'c1', 'a'])
})

// --- filters combine (story nmf.4, task nmf.4.1)

// t-a has defect and hotfix; t-b only defect; s-x is Study; p-y is a Proposal.
const MANY: FilterRow[] = [
  r('t-a', undefined, { tags: ['defect', 'hotfix'] }),
  r('t-b', undefined, { tags: ['defect'] }),
  r('b-c', undefined, { type: 'Bug', tags: ['hotfix'] }),
  r('s-x', undefined, { type: 'User Story', tags: ['study'] }),
  r('p-y', undefined, { type: 'User Story', state: 'Proposal', tags: ['Proposal'] }),
  r('e-z', undefined, { type: 'Epic' }),
]
const shown = (f: Partial<typeof NONE>) => [...visibleIds(MANY, { ...NONE, ...f }).shown].sort()

test('a value can be excluded: every type except Bug', () => {
  assert.deepEqual(shown({ type: exc('Bug') }), ['e-z', 'p-y', 's-x', 't-a', 't-b'])
})

test('several values of one field, any of them: study or Proposal', () => {
  assert.deepEqual(shown({ tag: inc('study', 'Proposal') }), ['p-y', 's-x'])
})

test('several tags, all of them: defect and hotfix', () => {
  assert.deepEqual(shown({ tag: { ...inc('defect', 'hotfix'), all: true } }), ['t-a'])
  assert.deepEqual(shown({ tag: inc('defect', 'hotfix') }), ['b-c', 't-a', 't-b'], 'any of them, when all is off')
})

test('filters on different fields all apply: Task, and not defect', () => {
  assert.deepEqual(shown({ type: inc('Task'), tag: exc('defect') }), [])
  assert.deepEqual(shown({ type: inc('Bug', 'Task'), tag: exc('defect') }), ['b-c'])
})

test('an exclude wins over an include of the same value, and excluding everything shows nothing', () => {
  assert.deepEqual(shown({ type: { include: ['Bug', 'Task'], exclude: ['Bug'], all: false } }), ['t-a', 't-b'])
  assert.deepEqual(shown({ type: exc('Task', 'Bug', 'User Story', 'Epic') }), [])
})

test('all applies to tags only: type and state hold one value per item, and ignore it', () => {
  assert.deepEqual(shown({ type: { ...inc('Bug', 'Task'), all: true } }), ['b-c', 't-a', 't-b'])
  assert.deepEqual(shown({ state: { ...inc('Open', 'Proposal'), all: true } }), MANY.map((x) => x.id).sort())
})

test('an excluded parent still stands above a child that matches, as context', () => {
  const v = visibleIds(ROWS, { ...NONE, type: exc('User Story', 'Epic') })
  assert.ok(v.shown.has('t2') && v.context.has('s1') && v.context.has('e1'))
})

test('the hidden-closed count follows the same rules as what is shown', () => {
  const rows = [...MANY, r('t-c', undefined, { state: 'Closed', tags: ['defect', 'hotfix'] }), r('t-d', undefined, { state: 'Closed', tags: ['defect'] })]
  const f = { ...NONE, showClosed: false, tag: { ...inc('defect', 'hotfix'), all: true } }
  assert.equal(hiddenClosed(rows, f), 1)
  assert.equal(hiddenClosed(rows, { ...f, tag: exc('hotfix') }), 1)
  assert.equal(hiddenClosed(rows, { ...f, state: inc('Closed') }), 0, 'an explicit Closed shows them')
})

// --- a Priority filter (story dox.3, task dox.3.1)

const PRIORITIES: FilterRow[] = [
  r('p1', undefined, { priority: '1' }),
  r('p3', undefined, { priority: '3' }),
  r('none', undefined),
  r('c3', undefined, { priority: '3', state: 'Closed' }),
]

test('priority is filtered by its shown name, and an item with none matches no included value', () => {
  assert.deepEqual([...visibleIds(PRIORITIES, { ...HIDE, priority: inc('P3') }).shown], ['p3'])
  assert.deepEqual([...visibleIds(PRIORITIES, { ...HIDE, priority: exc('P3') }).shown], ['p1', 'none'])
})

test('the hidden count and what is shown agree on priority', () => {
  assert.equal(hiddenClosed(PRIORITIES, { ...HIDE, priority: inc('P3') }), 1)
  assert.equal(hiddenClosed(PRIORITIES, { ...HIDE, priority: inc('P1') }), 0)
})
