import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hostFacts } from './host.ts'

test('the device nodes the host has are reported apart from the ones it does not', () => {
  // Passing --device for a path that does not exist is a hard failure rather
  // than a no-op, which is why the absent ones have to be known by name and not
  // merely left out.
  const facts = hostFacts({
    cpuCount: () => 8,
    exists: (p) => p === '/dev/fuse',
    devices: ['/dev/fuse', '/dev/net/tun', '/dev/kvm'],
  })
  assert.deepEqual(facts.devicesPresent, ['/dev/fuse'])
  assert.deepEqual(facts.devicesAbsent, ['/dev/net/tun', '/dev/kvm'])
})

test('the host cpu count is reported as the host sees it', () => {
  const facts = hostFacts({ cpuCount: () => 16, exists: () => false, devices: [] })
  assert.equal(facts.cpuCount, 16)
})

test('a host with none of the devices still produces facts', () => {
  const facts = hostFacts({ cpuCount: () => 2, exists: () => false, devices: ['/dev/kvm'] })
  assert.deepEqual(facts.devicesPresent, [])
  assert.deepEqual(facts.devicesAbsent, ['/dev/kvm'])
})
