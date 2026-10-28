import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CONFIG_GENERATION, GENERATED_BY } from '../build/devcontainer.ts'
import { staleness } from './stale.ts'

// --- a stale configuration is said, never rewritten unasked
// (debt a-projects-generated-container-configuration-does-not-follow-an-upgraded-extension)

const ours = (marker: Record<string, unknown>) => JSON.stringify({ image: 'x', [GENERATED_BY]: marker })

test('a configuration from before generations existed is stale, naming the version that wrote it', () => {
  // The file this debt was found with: written by 1.3.2, with no TZ.
  const s = staleness(ours({ extension: '1.3.2' }), '1.8.0')
  assert.ok(s.stale)
  assert.match(s.message, /1\.3\.2/)
  assert.match(s.message, /Regenerate/)
  assert.match(s.message, /nothing (was|has been) written/i)
})

test('an older generation is stale', () => {
  assert.equal(staleness(ours({ extension: '1.8.0', generation: CONFIG_GENERATION - 1 }), '1.9.0').stale, true)
})

test('the same generation says nothing, whatever version wrote it', () => {
  // Every release changes the version in the marker; only the generator's
  // output is worth a notice, or it fires on every upgrade and is ignored.
  assert.equal(staleness(ours({ extension: '0.0.1', generation: CONFIG_GENERATION }), '9.9.9').stale, false)
})

test('a newer generation, from a newer extension, is not offered back to an older one', () => {
  assert.equal(staleness(ours({ extension: '9.0.0', generation: CONFIG_GENERATION + 1 }), '1.8.0').stale, false)
})

test('a file the extension did not write, or cannot read, or that is not there, says nothing', () => {
  assert.equal(staleness(JSON.stringify({ image: 'hand-written' }), '1.8.0').stale, false)
  assert.equal(staleness('{ not json', '1.8.0').stale, false)
  assert.equal(staleness(null, '1.8.0').stale, false)
})
