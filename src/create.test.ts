import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decideCreate, type CreateInput } from './create.ts'

const plan = {
  writes: [{ path: '.code-server.stack.json', contents: '{}\n' }],
  commit: true,
}
const base: CreateInput = { plan, applied: { written: ['.code-server.stack.json'], failed: [] } }

test('a project that was written opens', () => {
  const d = decideCreate(base)
  assert.equal(d.open, true)
})

test('a refused plan does not open, and says what it found', () => {
  // **The third failure scenario.** Opening a directory that is not a project
  // lands somebody in a window where the extension then refuses, with the cause
  // two steps behind them.
  const d = decideCreate({ plan: { writes: [], commit: false, refused: 'it holds notes.txt' }, applied: undefined })
  assert.equal(d.open, false)
  assert.match(d.message, /notes\.txt/)
})

test('a write that failed partway names what landed and what did not, and does not open', () => {
  // The plan is a list precisely so this is answerable in one message. A loop
  // that throws on the third file and lets the exception out gives neither.
  const d = decideCreate({
    plan: { writes: [
      { path: 'a', contents: '' }, { path: 'b', contents: '' }, { path: 'c', contents: '' },
    ], commit: true },
    applied: { written: ['a', 'b'], failed: ['c'] },
  })
  assert.equal(d.open, false)
  assert.match(d.message, /a, b/)
  assert.match(d.message, /\bc\b/)
})

test('no commit is surfaced rather than swallowed, and still opens', () => {
  // Files there, history empty. Somebody finds out at their next `git log`
  // unless this says so — but it is not a reason to withhold the project.
  const d = decideCreate({
    plan: { writes: plan.writes, commit: false, note: 'git has no identity configured here' },
    applied: { written: ['.code-server.stack.json'], failed: [] },
  })
  assert.equal(d.open, true)
  assert.match(d.message, /identity/)
})

test('nothing applied at all does not open', () => {
  // A cancelled question leaves no plan to apply. The decision must not treat
  // "nothing happened" as "everything succeeded".
  const d = decideCreate({ plan: undefined, applied: undefined })
  assert.equal(d.open, false)
})
