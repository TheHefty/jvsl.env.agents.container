import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CONFIG_GENERATION, GENERATED_BY } from '../build/devcontainer.ts'
import { REBUILD_FROM_HOST, REBUILD_IN_CONTAINER } from '../build/build.ts'
import { afterRegenerate, staleness } from './stale.ts'

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

test('the notice names what the container is missing since the generation that wrote it', () => {
  // A generation-2 file already has the timezone; telling its owner that is
  // what they lack sends them looking for a difference that is not there.
  const two = staleness(ours({ extension: '2.2.1', generation: 2 }), '2.3.0')
  assert.ok(two.stale)
  assert.match(two.message, /ideas folder read-only/)
  assert.doesNotMatch(two.message, /timezone/)
  const one = staleness(ours({ extension: '1.3.2' }), '2.3.0')
  assert.ok(one.stale)
  assert.match(one.message, /timezone/)
  assert.match(one.message, /ideas folder read-only/)
})

test('a generation-3 file is told it lacks the verification queue, and only that', () => {
  // Task fo3.1.1 raised the generation to 4 for the queue's two binds.
  const three = staleness(ours({ extension: '2.3.0', generation: 3 }), '2.4.0')
  assert.ok(three.stale)
  assert.match(three.message, /verification requests read-only/)
  assert.doesNotMatch(three.message, /ideas folder/)
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

// --- a regenerated configuration reaches the container (debt
// regenerate-reopens-the-window-but-the-container-keeps-its-old-configuration)
//
// Found on 2026-10-28: Regenerate rewrote devcontainer.json and reopened, and
// Dev Containers reattached to the existing container, which kept the old
// configuration until a Rebuild Container by hand. The flow itself is driven
// through the bundle in tools/bundle.test.ts; these hold the decision.

test('the stale notice says Regenerate asks before recreating an existing container', () => {
  const s = staleness(ours({ extension: '1.3.2' }), '1.8.0')
  assert.ok(s.stale)
  assert.match(s.message, /asks? before recreating/i)
})

test('with no container for the project, Regenerate reopens, as before', () => {
  assert.deepEqual(afterRegenerate({ container: { kind: 'none' }, inContainer: false }), { say: 'reopen' })
})

test('with one, from the host, it asks to recreate it with the rebuild that reopens', () => {
  const d = afterRegenerate({ container: { kind: 'one', name: 'proj-ctr' }, inContainer: false })
  assert.equal(d.say, 'recreate')
  if (d.say !== 'recreate') return
  assert.equal(d.command, REBUILD_FROM_HOST)
  assert.match(d.message, /proj-ctr.*old configuration/s)
  assert.match(d.message, /ends everything running/)
})

test('inside the container window, it asks with the rebuild that runs there', () => {
  const d = afterRegenerate({ container: { kind: 'one', name: 'proj-ctr' }, inContainer: true })
  assert.equal(d.say === 'recreate' && d.command, REBUILD_IN_CONTAINER)
})

test('with several, none is recreated, and they are named', () => {
  const d = afterRegenerate({ container: { kind: 'many', names: ['a-ctr', 'b-ctr'] }, inContainer: false })
  assert.equal(d.say, 'ambiguous')
  assert.match(d.say === 'ambiguous' ? d.message : '', /a-ctr, b-ctr/)
})
