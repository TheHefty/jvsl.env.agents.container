import { test } from 'node:test'
import assert from 'node:assert/strict'

import { configureOutcome, type ConfigureResult } from './configure.ts'

test('a completed run reports the manifest it wrote', () => {
  const r: ConfigureResult = { wrote: true, root: '/work/chosen', stacks: ['java'] }
  const o = configureOutcome(r)
  assert.equal(o.proceed, true)
  assert.match(o.message, /\/work\/chosen/)
})

test('a cancelled run reports that nothing was written, and does not proceed', () => {
  // Escape at any of five steps is somebody deciding not to. Proceeding from
  // there builds core alone — a working image and the wrong one — and then
  // attaches them to it.
  const o = configureOutcome({ wrote: false, root: '/work/chosen', stacks: [] })
  assert.equal(o.proceed, false)
  assert.match(o.message, /nothing was written/i)
  // Not a failure. They chose to stop.
  assert.doesNotMatch(o.message, /error|failed|refused/i)
})

test('the root it reports is the one it was given', () => {
  // **The scenario whose cost trying again does not undo.** If this ever came
  // from the workspace instead, somebody would configure the project they had
  // open rather than the one they chose — rewriting a tracked file that is the
  // only record of what that project selected.
  for (const root of ['/work/a', '/elsewhere/b']) {
    assert.match(configureOutcome({ wrote: true, root, stacks: [] }).message, new RegExp(root))
  }
})
