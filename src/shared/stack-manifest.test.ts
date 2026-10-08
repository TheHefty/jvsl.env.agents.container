import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MANIFEST, LEGACY_MANIFEST, resolveManifest } from './stack-manifest.ts'

/**
 * Resolution is a pure function over what is on disk, which is what makes the
 * five cases testable at all. The caller does the writing, the reading back and
 * the unlinking — see the first of the task's three failure scenarios for why
 * the order there is not negotiable.
 */

test('the two names are different, and neither is empty', () => {
  assert.notEqual(MANIFEST, LEGACY_MANIFEST)
  assert.ok(MANIFEST.length > 0 && LEGACY_MANIFEST.length > 0)
})

test('a project with the new name is used as it is', () => {
  const r = resolveManifest({ current: '{"node":"22"}', legacy: null })
  assert.equal(r.action, 'use-current')
})

test('a project with only the old name is adopted, carrying its contents', () => {
  const r = resolveManifest({ current: null, legacy: '{"node":"22"}' })
  assert.equal(r.action, 'adopt')
  assert.equal(r.action === 'adopt' ? r.contents : null, '{"node":"22"}')
  // Said, not silent: a tracked file in somebody's repository changed.
  assert.match(r.action === 'adopt' ? r.note : '', /renamed/i)
})

test('a project with both keeps the new one and is told', () => {
  const r = resolveManifest({ current: '{"node":"22"}', legacy: '{"node":"18"}' })
  assert.equal(r.action, 'keep-both')
  // Nothing merged and nothing deleted: two names disagreeing is somebody's
  // situation, not a state to resolve by guessing which they meant.
  assert.match(r.action === 'keep-both' ? r.note : '', new RegExp(LEGACY_MANIFEST.replace(/\./g, '\\.')))
})

test('a file at the old name that does not parse is left alone', () => {
  const r = resolveManifest({ current: null, legacy: 'this is not json' })
  assert.equal(r.action, 'leave-unreadable')
  // The line FR-113 draws: what this extension did not write is somebody's
  // work, and a file it cannot recognise is not its own however it is named.
  assert.match(r.action === 'leave-unreadable' ? r.note : '', /could not be read/i)
})

test('an empty file at the old name does not parse either', () => {
  // '' is not valid JSON, and a truncated write is a likelier way to get here
  // than somebody typing prose into it.
  assert.equal(resolveManifest({ current: null, legacy: '' }).action, 'leave-unreadable')
})

test('a legacy manifest that parses to something other than an object is not one', () => {
  // `JSON.parse('null')` and `JSON.parse('[]')` both succeed. Adopting either
  // would rename a file whose content this extension cannot use.
  assert.equal(resolveManifest({ current: null, legacy: 'null' }).action, 'leave-unreadable')
  assert.equal(resolveManifest({ current: null, legacy: '[]' }).action, 'leave-unreadable')
})

test('neither name present is not a problem to report', () => {
  // Most folders are not projects. An extension that waking in one complains
  // about it is an extension people turn off.
  assert.equal(resolveManifest({ current: null, legacy: null }).action, 'none')
})
