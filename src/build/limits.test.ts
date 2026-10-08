import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cpusetRange, plusTwoGigabytes, readLimits } from './limits.ts'

test('two gigabytes more than the memory', () => {
  // Ported from start/src/main.rs, which is the behaviour being replaced.
  assert.equal(plusTwoGigabytes('6g'), '8g')
  assert.equal(plusTwoGigabytes('4096m'), '6144m')
})

test('a unit it does not know disables swap rather than guessing', () => {
  // Handing it back unchanged makes --memory-swap equal --memory: swap off.
  // That is what the launcher did for most of its life and is a safe place to
  // land; the alternative is guessing a number from a unit we did not
  // recognise and handing Docker a pair it refuses outright.
  for (const odd of ['6gb', 'lots', '', '6G']) {
    assert.equal(plusTwoGigabytes(odd), odd, odd)
  }
})

test('a core count becomes an inclusive range from zero', () => {
  assert.equal(cpusetRange(4, 16), '0-3')
  assert.equal(cpusetRange(1, 16), '0-0')
})

test('no core count falls back to half the host, never to zero cores', () => {
  assert.equal(cpusetRange(undefined, 16), '0-7')
  assert.equal(cpusetRange(undefined, 8), '0-3')
  // A single-core host must still get one core, not an empty range: Docker
  // refuses an empty cpuset and the message names neither value.
  assert.equal(cpusetRange(undefined, 1), '0-0')
  assert.equal(cpusetRange(0, 1), '0-0')
})

test('a manifest is read for what it declares', () => {
  const limits = readLimits('{"limits":{"memory":"8g","memorySwap":"12g","cpus":6}}')
  assert.deepEqual(limits, { memory: '8g', memorySwap: '12g', cpus: 6, usedDefaults: false })
})

test('a silent manifest gets what the launcher gave it', () => {
  const limits = readLimits('{"node":"22"}')
  assert.deepEqual(limits, { memory: '6g', memorySwap: '8g', cpus: undefined, usedDefaults: false })
})

test('swap is derived from the memory that was asked for, not from the default', () => {
  assert.equal(readLimits('{"limits":{"memory":"10g"}}').memorySwap, '12g')
})

test('an unreadable manifest falls back and says that it did', () => {
  // The launcher fell back silently. This cannot: opening with 6g when the
  // file asked for 8 and saying nothing is what turns this into an
  // unexplained OOM three hours later.
  for (const broken of ['{"limits":', 'not json at all', '']) {
    const limits = readLimits(broken)
    assert.equal(limits.memory, '6g', broken)
    assert.equal(limits.usedDefaults, true, `expected ${JSON.stringify(broken)} to be reported`)
  }
})

test('a manifest that is valid json but not an object is still a fallback', () => {
  assert.equal(readLimits('[1,2,3]').usedDefaults, true)
  assert.equal(readLimits('"a string"').usedDefaults, true)
})

test('limits of the wrong type are ignored rather than passed to docker', () => {
  // "memory": 6 would reach docker as `--memory 6`, which is six bytes.
  const limits = readLimits('{"limits":{"memory":6,"cpus":"four"}}')
  assert.equal(limits.memory, '6g')
  assert.equal(limits.cpus, undefined)
})
