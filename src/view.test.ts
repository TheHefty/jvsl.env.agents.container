import { test } from 'node:test'
import assert from 'node:assert/strict'

import { viewItems, type ViewState } from './view.ts'

/**
 * What the sidebar shows, as a function of what is on disk.
 *
 * The tree provider is a shell over this for the same reason the questions are:
 * a test that asserts a `TreeItem` was constructed is a test of the constructor.
 * What can be wrong here is which rows appear and what they say.
 */

const configured: ViewState = {
  stacksAvailable: ['java', 'node', 'rust'],
  manifest: { java: '21', rust: '1.83', limits: { memory: '6g', cpus: 4 } },
}

test('each selected stack is a row with its version', () => {
  const rows = viewItems(configured)
  assert.deepEqual(
    rows.filter((r) => r.kind === 'stack'),
    [
      { kind: 'stack', label: 'java', detail: '21' },
      { kind: 'stack', label: 'rust', detail: '1.83' },
    ],
  )
})

test('a stack the template has and the project did not select is not a row', () => {
  // The view says what is selected, not what exists. The picker is where the
  // available list belongs, and showing both here would make "selected" the
  // thing a reader has to infer.
  const rows = viewItems(configured)
  assert.ok(!rows.some((r) => r.label === 'node'), JSON.stringify(rows))
})

test('the limits are rows, and an absent one is not invented', () => {
  const rows = viewItems(configured).filter((r) => r.kind === 'limit')
  assert.deepEqual(rows, [
    { kind: 'limit', label: 'memory', detail: '6g' },
    { kind: 'limit', label: 'cpus', detail: '4' },
  ])
})

test('a project with no manifest says so, and says what to do', () => {
  const rows = viewItems({ stacksAvailable: ['java'], manifest: null })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.kind, 'empty')
  assert.match(rows[0]?.detail ?? '', /configure/i)
})

test('a manifest selecting nothing is not the same as no manifest', () => {
  // Zero stacks is a real selection — it produces the core image — and reporting
  // it as "not configured" would send somebody to answer questions they have
  // already answered.
  const rows = viewItems({ stacksAvailable: ['java'], manifest: { limits: { memory: '6g' } } })
  assert.ok(!rows.some((r) => r.kind === 'empty'), JSON.stringify(rows))
  assert.ok(rows.some((r) => r.kind === 'limit'), JSON.stringify(rows))
  assert.ok(rows.some((r) => r.kind === 'note' && /core/i.test(r.detail)), JSON.stringify(rows))
})

test('an uninitialised submodule is its own row, not an empty list', () => {
  // `.code-server/` exists and is empty until the submodule is checked out. An
  // empty tree there reads as a broken extension rather than a missing checkout,
  // which is the same confusion the questions refuse.
  const rows = viewItems({ stacksAvailable: [], manifest: null })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.kind, 'uninitialised')
  assert.match(rows[0]?.detail ?? '', /submodule update --init/)
})

test('a manifest key the extension does not own is not shown as a limit or a stack', () => {
  // It survives on disk — that is the questions' job — but inventing a row for
  // every unknown key would make the view a JSON viewer with worse formatting.
  const rows = viewItems({
    stacksAvailable: ['java'],
    manifest: { java: '21', teamNotes: 'kept', publishCodeServerPort: true },
  })
  assert.ok(!rows.some((r) => /teamNotes|publish/.test(r.label)), JSON.stringify(rows))
})

test('a failed build leaves a row, and a cancelled one says cancelled', () => {
  // FR-66's surface. The two have to read differently or stopping a build looks
  // like breaking one — and there is no notification, so this row is the only
  // place either is said.
  const failed = viewItems({ ...configured, lastBuild: 'failed' })
  assert.deepEqual(failed.at(-1), { kind: 'build', label: 'last build', detail: 'failed' })

  const cancelled = viewItems({ ...configured, lastBuild: 'cancelled' })
  assert.equal(cancelled.at(-1)?.detail, 'cancelled')
})

test('no build in this session leaves no row', () => {
  // Rather than "last build: never", which is a row that is always there and
  // says nothing on the first open.
  assert.ok(!viewItems(configured).some((r) => r.kind === 'build'), 'a build row appeared')
})
