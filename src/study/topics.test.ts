import { test } from 'node:test'
import assert from 'node:assert/strict'

import { topicRows, type TopicFolder } from './topics.ts'
import type { Item } from '../board/board-read.ts'

// --- every topic is listed, whatever its state (story the-study-view) ----------
//
// A broken topic, a topic nobody tracked, or a tracker that cannot be read must
// not make a topic disappear: a list that looks complete and is not is the worse
// failure.

const folder = (slug: string, problems: TopicFolder['problems'] = []): TopicFolder => ({ slug, title: `Title of ${slug}`, problems })
const task = (slug: string, status: string, labels: string[] = ['study']): Item =>
  ({ id: `t-${slug}`, title: slug, status, type: 'task', labels, blockedBy: [], metadata: { study: slug } })

test('each topic shows the state its task is in', () => {
  const rows = topicRows(
    [folder('a'), folder('b'), folder('c'), folder('d')],
    { ok: true, items: [task('a', 'open'), task('b', 'in_progress'), task('c', 'open', ['study', 'ready-to-write']), task('d', 'closed')] },
  )
  assert.deepEqual(rows.map((r) => `${r.slug}:${r.state}`), ['a:not studied', 'b:studying', 'c:ready to write', 'd:published'])
})

test('a topic with no task is listed as not tracked', () => {
  const [row] = topicRows([folder('a')], { ok: true, items: [] })
  assert.equal(row?.state, 'not tracked')
})

test('a task is matched by its slug, never by its title', () => {
  const item: Item = { ...task('a', 'in_progress'), title: 'something else entirely' }
  assert.equal(topicRows([folder('a')], { ok: true, items: [item] })[0]?.state, 'studying')
})

test('with the tracker unreachable, every topic is still listed, its state unknown and the reason said', () => {
  const rows = topicRows([folder('a'), folder('b')], { ok: false, why: 'the container is not running' })
  assert.deepEqual(rows.map((r) => r.state), ['unknown', 'unknown'])
  assert.match(rows[0]?.detail ?? '', /container is not running/)
})

test('a broken topic is a row with its first problem, never left out', () => {
  const rows = topicRows(
    [folder('ok'), folder('broken', [{ file: 'guide.md', path: '', rule: 'section', message: 'has no "## Sources" section' }])],
    { ok: true, items: [task('ok', 'open'), task('broken', 'open')] },
  )
  const broken = rows.find((r) => r.slug === 'broken')
  assert.ok(broken)
  assert.equal(broken.problem, 'guide.md: /: has no "## Sources" section')
})

test('topics are listed in a stable order', () => {
  const rows = topicRows([folder('b'), folder('a')], { ok: true, items: [] })
  assert.deepEqual(rows.map((r) => r.slug), ['a', 'b'])
})

// --- reading the folders through the project's files ---------------------------

import { readTopics } from './topics.ts'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import type { ProjectFiles } from '../host/files.ts'

const EXAMPLE = join(import.meta.dirname, '../../core/plugin/agent-container/study/example/bd-labels-are-null')
const fakeFiles = (tree: Record<string, string>): ProjectFiles => ({
  read: (rel) => tree[rel] ?? null,
  write: () => undefined,
  exists: (rel) => rel in tree || Object.keys(tree).some((k) => k.startsWith(`${rel}/`)),
  list: (rel) => {
    const names = new Set(Object.keys(tree).filter((k) => k.startsWith(`${rel}/`)).map((k) => k.slice(rel.length + 1).split('/')[0]!))
    return names.size === 0 ? null : [...names].sort()
  },
  mkdirAbsolute: () => undefined,
  remove: () => undefined,
})
const example = (slug: string) => ({
  [`docs/study/${slug}/guide.md`]: readFileSync(join(EXAMPLE, 'guide.md'), 'utf8'),
})

test('topic folders are read through the files they are given, titled by their guide', () => {
  const topics = readTopics(fakeFiles({ ...example('bd-labels-are-null'), 'docs/study/.gitignore': '*/attempts.json\n' }))
  assert.deepEqual(topics.map((t) => [t.slug, t.title, t.problems.length]), [['bd-labels-are-null', 'bd prints labels as null, not as an empty list', 0]])
})

test('a hidden folder is not a topic, even with a guide in it', () => {
  const tree = { ...example('bd-labels-are-null'), 'docs/study/.drafts/guide.md': '# draft\n' }
  assert.deepEqual(readTopics(fakeFiles(tree)).map((t) => t.slug), ['bd-labels-are-null'])
})

test('no docs/study at all is no topics, not an error', () => {
  assert.deepEqual(readTopics(fakeFiles({})), [])
})

test('a topic built before the practice left is listed whole, its leftover files ignored', () => {
  const tree = { ...example('old-topic'), 'docs/study/old-topic/practice.json': '{ broken', 'docs/study/old-topic/attempts.json': '{}' }
  const [topic] = readTopics(fakeFiles(tree))
  assert.equal(topic?.slug, 'old-topic')
  assert.deepEqual(topic?.problems, [])
})
