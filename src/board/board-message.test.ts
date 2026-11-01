import { test } from 'node:test'
import assert from 'node:assert/strict'

import { onBoardMessage, rememberedView } from './board-message.ts'

/**
 * What the Work view's page may ask of the extension (story nmf.2): to read
 * the tracker again, and to remember which board view was chosen. The second
 * writes only the workspace's own memory, never the tracker.
 */
function deps() {
  const calls: string[] = []
  return {
    calls,
    deps: {
      refresh: () => { calls.push('refresh') },
      remember: (view: string) => { calls.push(`remember ${view}`) },
      copy: (id: string) => { calls.push(`copy ${id}`) },
      known: (id: string) => id === 'p-c20',
    },
  }
}

test('a view message remembers the view, and reads nothing', () => {
  const { calls, deps: d } = deps()
  onBoardMessage({ type: 'view', view: 'stories' }, d)
  assert.deepEqual(calls, ['remember stories'])
})

test('only the three views are remembered; anything else is ignored', () => {
  const { calls, deps: d } = deps()
  for (const view of ['', 'closed', '../x', 42, undefined, { view: 'tasks' }]) onBoardMessage({ type: 'view', view }, d)
  assert.deepEqual(calls, [])
})

test('refresh reads again, and no other message does anything', () => {
  const { calls, deps: d } = deps()
  onBoardMessage({ type: 'refresh' }, d)
  for (const m of [{ type: 'close', id: 'x' }, { type: 'update' }, null, 'refresh', 7]) onBoardMessage(m, d)
  assert.deepEqual(calls, ['refresh'])
})

test('the view opened is the one remembered, or All items when nothing valid is', () => {
  assert.equal(rememberedView('tasks'), 'tasks')
  assert.equal(rememberedView('stories'), 'stories')
  assert.equal(rememberedView(undefined), 'all')
  assert.equal(rememberedView('nonsense'), 'all')
})

test('Tasks by story is accepted and remembered like the other views (story nmf.5)', () => {
  const { calls, deps: d } = deps()
  onBoardMessage({ type: 'view', view: 'by-story' }, d)
  assert.deepEqual(calls, ['remember by-story'])
  assert.equal(rememberedView('by-story'), 'by-story')
})

test('Copy ID copies an id on the page, and nothing else can reach the clipboard (story dox.4)', () => {
  const { calls, deps: d } = deps()
  onBoardMessage({ type: 'copy', id: 'p-c20' }, d)
  assert.deepEqual(calls, ['copy p-c20'])
  onBoardMessage({ type: 'copy', id: 'not on the page' }, d)
  onBoardMessage({ type: 'copy', id: 42 }, d)
  onBoardMessage({ type: 'copy' }, d)
  assert.deepEqual(calls, ['copy p-c20'])
})
