import { test } from 'node:test'
import assert from 'node:assert/strict'

import { columns, parseExport, tree } from './board-read.ts'

// Lines in the shape `bd export` prints, measured against bd v1.3.1: one JSON
// object per line, the hierarchy as `parent-child` dependencies, blocking as
// `blocks` dependencies, and empty long fields simply absent.
const line = (o: Record<string, unknown>) => JSON.stringify({ _type: 'issue', priority: 2, ...o })
const dep = (from: string, to: string, type: string) => ({ issue_id: from, depends_on_id: to, type })

const EXPORT = [
  line({ id: 'p-1', title: 'An epic', status: 'open', issue_type: 'epic', description: 'why' }),
  line({ id: 'p-1.1', title: 'A story', status: 'in_progress', issue_type: 'feature',
    acceptance_criteria: 'Given', design: 'how', dependencies: [dep('p-1.1', 'p-1', 'parent-child')] }),
  line({ id: 'p-1.1.1', title: 'A task', status: 'closed', issue_type: 'task', close_reason: 'merged in #9',
    dependencies: [dep('p-1.1.1', 'p-1.1', 'parent-child')] }),
  line({ id: 'p-1.1.2', title: 'Blocked task', status: 'open', issue_type: 'task',
    dependencies: [dep('p-1.1.2', 'p-1.1', 'parent-child'), dep('p-1.1.2', 'p-9', 'blocks')] }),
  line({ id: 'p-1.1.3', title: 'Was blocked', status: 'open', issue_type: 'task',
    dependencies: [dep('p-1.1.3', 'p-1.1.1', 'blocks')] }),
  line({ id: 'p-2', title: 'A draft story', status: 'deferred', issue_type: 'feature', labels: ['proposed'] }),
  line({ id: 'p-3', title: 'Put aside', status: 'deferred', issue_type: 'task' }),
  line({ id: 'p-4', title: 'A defect', status: 'open', issue_type: 'bug', labels: ['defect'] }),
  line({ id: 'p-9', title: 'Blocker', status: 'open', issue_type: 'task' }),
  '',
].join('\n')

test('every issue line becomes an item, with its long fields where it has them', () => {
  const items = parseExport(EXPORT)
  assert.equal(items.length, 9)
  const story = items.find((i) => i.id === 'p-1.1')!
  assert.equal(story.acceptance, 'Given')
  assert.equal(story.design, 'how')
  assert.equal(story.parent, 'p-1')
  assert.equal(items.find((i) => i.id === 'p-1.1.1')!.closeReason, 'merged in #9')
  assert.equal(items.find((i) => i.id === 'p-1')!.acceptance, undefined)
})

test('lines that are not issues are skipped, and a broken line is reported, not swallowed', () => {
  assert.equal(parseExport(line({ _type: 'memory', id: 'm' }) + '\n').length, 0)
  assert.throws(() => parseExport('{not json\n'), /line 1/)
})

test('the board has six columns in a fixed order', () => {
  assert.deepEqual(
    columns(parseExport(EXPORT)).map((c) => c.key),
    ['proposed', 'open', 'in_progress', 'blocked', 'deferred', 'closed'],
  )
})

test('a proposal is its own column whatever its stored state, because it is not work', () => {
  const byKey = Object.fromEntries(columns(parseExport(EXPORT)).map((c) => [c.key, c.items.map((i) => i.id)]))
  assert.deepEqual(byKey['proposed'], ['p-2'])
  assert.deepEqual(byKey['deferred'], ['p-3'])
})

test('blocked means an open item waiting on one that is not closed', () => {
  const byKey = Object.fromEntries(columns(parseExport(EXPORT)).map((c) => [c.key, c.items.map((i) => i.id)]))
  assert.deepEqual(byKey['blocked'], ['p-1.1.2'])
  assert.ok(byKey['open']!.includes('p-1.1.3'), 'a blocker that is closed blocks nothing')
})

test('every item is in exactly one column', () => {
  const all = columns(parseExport(EXPORT)).flatMap((c) => c.items.map((i) => i.id)).sort()
  assert.deepEqual(all, parseExport(EXPORT).map((i) => i.id).sort())
})

test('a debt carries its kind', () => {
  const defect = parseExport(EXPORT).find((i) => i.id === 'p-4')!
  assert.equal(defect.debtKind, 'defect')
  assert.equal(parseExport(EXPORT).find((i) => i.id === 'p-9')!.debtKind, undefined)
})

test('the tree nests by parent, and keeps items with no parent at its root', () => {
  const roots = tree(parseExport(EXPORT))
  assert.deepEqual(roots.map((n) => n.item.id), ['p-1', 'p-1.1.3', 'p-2', 'p-3', 'p-4', 'p-9'])
  const epic = roots[0]!
  assert.deepEqual(epic.children.map((n) => n.item.id), ['p-1.1'])
  assert.deepEqual(epic.children[0]!.children.map((n) => n.item.id), ['p-1.1.1', 'p-1.1.2'])
})

test('an item whose parent is missing is not lost', () => {
  const orphan = parseExport(line({ id: 'o', title: 'o', status: 'open', issue_type: 'task',
    dependencies: [dep('o', 'gone', 'parent-child')] }))
  assert.deepEqual(tree(orphan).map((n) => n.item.id), ['o'])
})

// --- Azure DevOps's shape (task: the-board-takes-azure-devops-shape) --------

import { backlogRows, typeLook } from './board-read.ts'

test('every known bd type is shown under Azure DevOps\'s name and colour', () => {
  assert.deepEqual(typeLook('epic'), { name: 'Epic', colour: '#FF7B00' })
  assert.deepEqual(typeLook('feature'), { name: 'User Story', colour: '#009CCC' })
  assert.deepEqual(typeLook('task'), { name: 'Task', colour: '#F2CB1D' })
  assert.deepEqual(typeLook('bug'), { name: 'Bug', colour: '#CC293D' })
})

test('a type the table does not know keeps its own name, never folded into another', () => {
  assert.deepEqual(typeLook('chore'), { name: 'chore', colour: '#8A8886' })
})

test('the backlog lists every item exactly once, depth first, orphans at the top', () => {
  const items = parseExport(EXPORT)
  const rows = backlogRows(items)
  assert.deepEqual(rows.map((r) => r.item.id).sort(), items.map((i) => i.id).sort())
  assert.deepEqual(
    rows.slice(0, 5).map((r) => [r.item.id, r.depth, r.hasChildren]),
    [['p-1', 0, true], ['p-1.1', 1, true], ['p-1.1.1', 2, false], ['p-1.1.2', 2, false], ['p-1.1.3', 0, false]],
  )
})
