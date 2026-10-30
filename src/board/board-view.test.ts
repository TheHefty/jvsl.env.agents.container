import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseExport, type Item } from './board-read.ts'
import { boardView, chainMarks, VIEWS, type BoardView } from './board-view.ts'

/**
 * The board's three views (story nmf.2, task nmf.2.1). One export, in the shape
 * `bd export` prints, feeds both these functions and the real refine-candidates,
 * so the Stories view cannot drift from refinement's agenda unseen.
 */
// Dated as bd dates every item: planning-brief reads updated_at, and fails on an item without one.
const line = (o: Record<string, unknown>) => JSON.stringify({
  _type: 'issue', priority: 2, labels: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...o,
})
const child = (from: string, to: string) => ({ issue_id: from, depends_on_id: to, type: 'parent-child' })
const blocks = (from: string, to: string) => ({ issue_id: from, depends_on_id: to, type: 'blocks' })
const REJECTED = 'Rejected in refinement: not worth it'

const EXPORT = [
  line({ id: 'e1', title: 'Open epic', status: 'open', issue_type: 'epic' }),
  line({ id: 'e2', title: 'Closed epic', status: 'closed', issue_type: 'epic' }),
  line({ id: 'e3', title: 'Proposed epic', status: 'deferred', issue_type: 'epic', labels: ['proposed'] }),
  // Stories under e1, one per column.
  line({ id: 's-none', title: 'No task yet', status: 'open', issue_type: 'feature', dependencies: [child('s-none', 'e1')] }),
  line({ id: 's-dev', title: 'Being built', status: 'in_progress', issue_type: 'feature', dependencies: [child('s-dev', 'e1')] }),
  line({ id: 't-dev', title: 'Building it', status: 'in_progress', issue_type: 'task', dependencies: [child('t-dev', 's-dev')] }),
  line({ id: 's-verify', title: 'Built', status: 'open', issue_type: 'feature', dependencies: [child('s-verify', 'e1')] }),
  line({ id: 't-done', title: 'Built it', status: 'closed', issue_type: 'task', close_reason: 'Merged in #1', dependencies: [child('t-done', 's-verify')] }),
  line({ id: 's-rejected', title: 'Only rejected tasks', status: 'open', issue_type: 'feature', dependencies: [child('s-rejected', 'e1')] }),
  line({ id: 't-rej', title: 'Rejected', status: 'closed', issue_type: 'task', close_reason: REJECTED, dependencies: [child('t-rej', 's-rejected')] }),
  line({ id: 's-proposed-task', title: 'Only a proposed task', status: 'open', issue_type: 'feature', dependencies: [child('s-proposed-task', 'e1')] }),
  line({ id: 't-prop', title: 'A draft', status: 'deferred', issue_type: 'task', labels: ['proposed'], dependencies: [child('t-prop', 's-proposed-task')] }),
  line({ id: 's-blocked', title: 'Blocked story', status: 'open', issue_type: 'feature', dependencies: [child('s-blocked', 'e1'), blocks('s-blocked', 's-none')] }),
  line({ id: 's-closed', title: 'Finished', status: 'closed', issue_type: 'feature', dependencies: [child('s-closed', 'e1')] }),
  // An open story under a closed epic, and a task still open under a closed story.
  line({ id: 's-late', title: 'Open under a closed epic', status: 'open', issue_type: 'feature', dependencies: [child('s-late', 'e2')] }),
  line({ id: 's-gone', title: 'Closed story', status: 'closed', issue_type: 'feature', dependencies: [child('s-gone', 'e2')] }),
  line({ id: 't-orphaned', title: 'Open under a closed story', status: 'open', issue_type: 'task', dependencies: [child('t-orphaned', 's-gone')] }),
  // Debts, with no epic: one planned, one not.
  line({ id: 'd-plan', title: 'Planned debt', status: 'in_progress', issue_type: 'bug', labels: ['defect'] }),
  line({ id: 't-debt', title: 'Fixing the debt', status: 'open', issue_type: 'task', dependencies: [child('t-debt', 'd-plan')] }),
  line({ id: 'd-new', title: 'Unplanned debt', status: 'open', issue_type: 'bug', labels: ['hotfix'] }),
  line({ id: 'b-plain', title: 'A bug that is not a debt', status: 'open', issue_type: 'bug' }),
  // A story with no epic, a proposed story, a deferred task, a blocked task.
  line({ id: 's-loose', title: 'No epic', status: 'open', issue_type: 'feature' }),
  line({ id: 's-draft', title: 'Draft story', status: 'deferred', issue_type: 'feature', labels: ['proposed'], dependencies: [child('s-draft', 'e1')] }),
  line({ id: 't-aside', title: 'Put aside', status: 'deferred', issue_type: 'task', dependencies: [child('t-aside', 's-loose')] }),
  line({ id: 't-blocked', title: 'Waiting', status: 'open', issue_type: 'task', dependencies: [child('t-blocked', 's-loose'), blocks('t-blocked', 't-dev')] }),
  line({ id: 't-ready', title: 'Can start', status: 'open', issue_type: 'task', dependencies: [child('t-ready', 's-loose'), blocks('t-ready', 't-done')] }),
  line({ id: 'j1', title: 'Journal 2026-10-28', status: 'closed', issue_type: 'chore', labels: ['journal'] }),
  '',
].join('\n')
const ITEMS: Item[] = parseExport(EXPORT)

/** Where each item landed: its lane and column, every time it appears. */
const places = (v: BoardView) =>
  v.lanes.flatMap((lane) => lane.columns.flatMap((c) => c.items.map((i) => ({ id: i.id, lane: lane.key, column: c.key }))))
const column = (v: BoardView, id: string) => places(v).filter((p) => p.id === id).map((p) => p.column)
const ids = (v: BoardView, key: string) => places(v).filter((p) => p.column === key).map((p) => p.id).sort()

test('the three views exist, in the order the picker shows them', () => {
  assert.deepEqual(VIEWS.map((v) => v.name), ['tasks', 'by-story', 'stories', 'all'])
  assert.deepEqual(VIEWS.map((v) => v.title), ['Tasks', 'Tasks by story', 'Stories by epic', 'All items'])
})

// --- Tasks ---

test('Tasks shows the tasks, the debts\' included, in Ready, Blocked, In progress and Done', () => {
  const v = boardView(ITEMS, 'tasks')
  assert.deepEqual(v.lanes[0]?.columns.map((c) => c.title), ['Ready', 'Blocked', 'In progress', 'Done'])
  assert.deepEqual(ids(v, 'ready'), ['t-debt', 't-orphaned', 't-ready'])
  assert.deepEqual(ids(v, 'blocked'), ['t-blocked'])
  assert.deepEqual(ids(v, 'in_progress'), ['t-dev'])
  assert.deepEqual(ids(v, 'done'), ['t-done', 't-rej'])
})

test('a task that is a proposal or deferred is not work, and is not in the Tasks view', () => {
  const v = boardView(ITEMS, 'tasks')
  assert.deepEqual([...column(v, 't-prop'), ...column(v, 't-aside')], [])
  assert.deepEqual(places(v).filter((p) => !p.id.startsWith('t-')), [], 'only tasks')
})

// --- Stories by epic ---

test('Stories by epic has one lane per open epic, the closed epic that still has open work, and No epic', () => {
  const v = boardView(ITEMS, 'stories')
  assert.deepEqual(v.lanes.map((l) => l.key), ['e1', 'e2', ''])
  assert.equal(v.lanes.find((l) => l.key === '')?.title, 'No epic')
  assert.equal(v.lanes.some((l) => l.key === 'e3'), false, 'a proposed epic is not a lane')
  assert.deepEqual(v.lanes[0]?.columns.map((c) => c.title), ['No task', 'In development', 'Awaiting verification', 'Done'])
})

test('each story sits in the column its tasks say', () => {
  const v = boardView(ITEMS, 'stories')
  assert.deepEqual(column(v, 's-none'), ['no_task'])
  assert.deepEqual(column(v, 's-dev'), ['in_development'])
  assert.deepEqual(column(v, 's-verify'), ['awaiting_verification'])
  assert.deepEqual(column(v, 's-rejected'), ['no_task'], 'a rejected task is not work done')
  assert.deepEqual(column(v, 's-proposed-task'), ['no_task'], 'a proposed task is not an agreed one')
  assert.deepEqual(column(v, 's-closed'), ['done'])
  assert.deepEqual(column(v, 'd-plan'), ['in_development'])
  assert.deepEqual(column(v, 'd-new'), ['no_task'])
})

test('debts and stories with no epic are in the No epic lane; a bug that is not a debt is not a story', () => {
  const v = boardView(ITEMS, 'stories')
  const loose = places(v).filter((p) => p.lane === '').map((p) => p.id).sort()
  assert.deepEqual(loose, ['d-new', 'd-plan', 's-loose'])
  assert.deepEqual(column(v, 'b-plain'), [])
  assert.deepEqual(column(v, 's-draft'), [], 'a proposed story is left to All items')
})

// --- every item of a view's kinds lands in exactly one place ---

test('every task, and every agreed story and debt, is in exactly one place in its view', () => {
  const tasks = ITEMS.filter((i) => i.type === 'task' && i.status !== 'deferred' && !i.labels.includes('proposed'))
  const stories = ITEMS.filter((i) => (i.type === 'feature' || i.debtKind !== undefined) && i.status !== 'deferred' && !i.labels.includes('proposed'))
  for (const [view, wanted] of [['tasks', tasks], ['stories', stories]] as const) {
    const v = boardView(ITEMS, view)
    for (const item of wanted) assert.equal(column(v, item.id).length, 1, `${view}: ${item.id} is in ${column(v, item.id).length} places`)
    assert.equal(places(v).length, wanted.length, `${view}: nothing else`)
  }
  const all = boardView(ITEMS, 'all')
  for (const item of ITEMS) assert.equal(column(all, item.id).length, 1, `all: ${item.id}`)
})

test('All items keeps today\'s six columns', () => {
  const v = boardView(ITEMS, 'all')
  assert.deepEqual(v.lanes[0]?.columns.map((c) => c.title), ['Proposals', 'Open', 'In progress', 'Blocked', 'Deferred', 'Closed'])
})

// --- the Stories view and refinement's agenda agree ---

test('the Stories view and refinement\'s agenda put the same stories and debts in the same buckets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'board-view-'))
  const file = join(dir, 'export.jsonl')
  writeFileSync(file, EXPORT)
  const script = join(import.meta.dirname, '..', '..', 'core', 'plugin', 'agent-container', 'bin', 'refine-candidates')
  const agenda = execFileSync('bash', [script], { env: { ...process.env, TRACKER_EXPORT: file }, encoding: 'utf8' })
  const section = (h: string) => {
    const at = agenda.split('\n').indexOf(`## ${h}`)
    const rest = agenda.split('\n').slice(at + 1)
    const end = rest.findIndex((l) => l.startsWith('## '))
    return (end === -1 ? rest : rest.slice(0, end)).filter((l) => l.startsWith('- ')).map((l) => l.split(' ')[1]!).sort()
  }
  const v = boardView(ITEMS, 'stories')
  assert.deepEqual(ids(v, 'no_task'), [...section('Stories with no agreed task'), ...section('Debts with no agreed task')].sort())
  assert.deepEqual(ids(v, 'awaiting_verification'), section('Awaiting verification'))
})

// --- where each item is in the chain (story nmf.3, task nmf.3.1)

const script = (name: string) => join(import.meta.dirname, '..', '..', 'core', 'plugin', 'agent-container', 'bin', name)
const sectionOf = (out: string, h: string) => {
  const lines = out.split('\n')
  const rest = lines.slice(lines.indexOf(`## ${h}`) + 1)
  const end = rest.findIndex((l) => l.startsWith('## '))
  return (end === -1 ? rest : rest.slice(0, end)).filter((l) => l.startsWith('- ')).map((l) => l.split(' ')[1]!).sort()
}
const runOn = (name: string, extra: Record<string, string> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'chain-marks-'))
  writeFileSync(join(dir, 'export.jsonl'), EXPORT)
  // The brief also reads the journal: an empty home and a gh that always fails
  // keep this test off the network, and the journal is not what is compared.
  return execFileSync('bash', [script(name)], {
    env: { ...process.env, TRACKER_EXPORT: join(dir, 'export.jsonl'), JOURNAL_HOME: dir, REVIEW_GH: 'false', ...extra },
    encoding: 'utf8',
  })
}
const marked = (what: 'awaitingVerification' | 'ready' | 'noCriterion') =>
  [...chainMarks(ITEMS)].filter(([, m]) => m[what]).map(([id]) => id).sort()

test('Awaiting verification is marked on what refinement\'s agenda lists there', () => {
  assert.deepEqual(marked('awaitingVerification'), sectionOf(runOn('refine-candidates'), 'Awaiting verification'))
  assert.ok(marked('awaitingVerification').includes('s-verify'))
})

test('Ready is marked on what the planning\'s brief offers, and no done criterion where the brief says so', () => {
  const brief = runOn('planning-brief', { PLANNING_TODAY: '2026-10-30' })
  assert.deepEqual(marked('ready'), sectionOf(brief, 'Ready'))
  const noCriterion = brief.split('\n').filter((l) => l.startsWith('- ') && l.endsWith('no done criterion')).map((l) => l.split(' ')[1]!).sort()
  assert.deepEqual(marked('noCriterion'), noCriterion)
  assert.ok(marked('ready').includes('t-ready') && !marked('ready').includes('t-blocked'))
})

// --- priority orders the work ---

const P = [
  line({ id: 'e9', title: 'Epic', status: 'open', issue_type: 'epic', priority: 3 }),
  line({ id: 's-low', title: 'Low', status: 'open', issue_type: 'feature', priority: 4, dependencies: [child('s-low', 'e9')] }),
  line({ id: 's-unset', title: 'Unset', status: 'open', issue_type: 'feature', priority: null, dependencies: [child('s-unset', 'e9')] }),
  line({ id: 's-high', title: 'High', status: 'open', issue_type: 'feature', priority: 0, dependencies: [child('s-high', 'e9')] }),
  line({ id: 's-tie-a', title: 'Tie A', status: 'open', issue_type: 'feature', priority: 2, dependencies: [child('s-tie-a', 'e9')] }),
  line({ id: 's-tie-b', title: 'Tie B', status: 'open', issue_type: 'feature', priority: 2, dependencies: [child('s-tie-b', 'e9')] }),
  '',
].join('\n')

test('within a column, items are ordered by priority, unset last, ties as they were', () => {
  const v = boardView(parseExport(P), 'stories')
  const noTask = v.lanes.find((l) => l.key === 'e9')!.columns.find((c) => c.key === 'no_task')!
  assert.deepEqual(noTask.items.map((i) => i.id), ['s-high', 's-tie-a', 's-tie-b', 's-low', 's-unset'])
})

// --- Tasks by story (story nmf.5, task nmf.5.1)

test('Tasks by story puts each task in its story\'s or debt\'s lane, in the Tasks view\'s columns', () => {
  const v = boardView(ITEMS, 'by-story')
  assert.deepEqual(v.lanes.map((l) => l.key), ['s-dev', 's-verify', 's-rejected', 's-gone', 'd-plan', 's-loose'])
  assert.deepEqual(v.lanes[0]?.columns.map((c) => c.title), ['Ready', 'Blocked', 'In progress', 'Done'])
  const where = (id: string) => places(v).filter((p) => p.id === id).map((p) => `${p.lane}/${p.column}`)
  assert.deepEqual(where('t-dev'), ['s-dev/in_progress'])
  assert.deepEqual(where('t-debt'), ['d-plan/ready'], "a debt's task is in its debt's lane")
  assert.deepEqual(where('t-orphaned'), ['s-gone/ready'], 'under a closed story, still in its lane')
  assert.deepEqual(where('t-blocked'), ['s-loose/blocked'])
  assert.deepEqual([...where('t-prop'), ...where('t-aside')], [], 'proposals and deferred tasks are not work')
})

test('a lane is titled Epic › Story, or by its own title when it has no epic, and a closed story\'s lane is marked', () => {
  const v = boardView(ITEMS, 'by-story')
  const lane = (k: string) => v.lanes.find((l) => l.key === k)!
  assert.equal(lane('s-dev').title, 'Open epic › Being built')
  assert.equal(lane('s-gone').title, 'Closed epic › Closed story')
  assert.equal(lane('d-plan').title, 'Planned debt')
  assert.equal(lane('s-gone').closed, true)
  assert.equal(lane('s-dev').closed, false)
})

const BY = [
  line({ id: 'e', title: 'Epic', status: 'open', issue_type: 'epic' }),
  line({ id: 's-lo', title: 'Lo', status: 'open', issue_type: 'feature', priority: 3, dependencies: [child('s-lo', 'e')] }),
  line({ id: 't2', title: 'T2', status: 'open', issue_type: 'task', dependencies: [child('t2', 's-lo')] }),
  line({ id: 's-un', title: 'Unset', status: 'open', issue_type: 'feature', priority: null }),
  line({ id: 't3', title: 'T3', status: 'open', issue_type: 'task', dependencies: [child('t3', 's-un')] }),
  line({ id: 's-tie1', title: 'Tie one', status: 'open', issue_type: 'feature', priority: 1, dependencies: [child('s-tie1', 'e')] }),
  line({ id: 't4', title: 'T4', status: 'open', issue_type: 'task', dependencies: [child('t4', 's-tie1')] }),
  line({ id: 's-hi', title: 'Hi', status: 'open', issue_type: 'feature', priority: 0, dependencies: [child('s-hi', 'e')] }),
  line({ id: 't1', title: 'T1', status: 'open', issue_type: 'task', dependencies: [child('t1', 's-hi')] }),
  line({ id: 's-tie2', title: 'Tie two', status: 'open', issue_type: 'feature', priority: 1, dependencies: [child('s-tie2', 'e')] }),
  line({ id: 't5', title: 'T5', status: 'open', issue_type: 'task', dependencies: [child('t5', 's-tie2')] }),
  line({ id: 's-empty', title: 'No tasks', status: 'open', issue_type: 'feature', priority: 0, dependencies: [child('s-empty', 'e')] }),
  line({ id: 't-epic', title: 'Straight under the epic', status: 'open', issue_type: 'task', dependencies: [child('t-epic', 'e')] }),
  line({ id: 't-none', title: 'No parent', status: 'open', issue_type: 'task' }),
  line({ id: 't-sub', title: 'Under a task', status: 'open', issue_type: 'task', dependencies: [child('t-sub', 't-none')] }),
  '',
].join('\n')

test('lanes follow the story\'s priority, ties as exported, unset last, then No story', () => {
  const v = boardView(parseExport(BY), 'by-story')
  assert.deepEqual(v.lanes.map((l) => l.key), ['s-hi', 's-tie1', 's-tie2', 's-lo', 's-un', ''])
  assert.equal(v.lanes.at(-1)?.title, 'No story')
  assert.equal(v.lanes.some((l) => l.key === 's-empty'), false, 'a story with no task has no lane here')
})

test('a task with no story, under an epic, or under another task is in No story; every task is in exactly one place', () => {
  const items = parseExport(BY)
  const v = boardView(items, 'by-story')
  const noStory = v.lanes.find((l) => l.key === '')!.columns.flatMap((c) => c.items.map((i) => i.id)).sort()
  assert.deepEqual(noStory, ['t-epic', 't-none', 't-sub'])
  for (const t of [...items, ...ITEMS].filter((i) => i.type === 'task' && i.status !== 'deferred' && !i.labels.includes('proposed'))) {
    const from = items.includes(t) ? v : boardView(ITEMS, 'by-story')
    assert.equal(column(from, t.id).length, 1, `${t.id} is in ${column(from, t.id).length} places`)
  }
})
