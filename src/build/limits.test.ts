import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cpusetRange, plusTwoGigabytes, readLimits, validateCpus, validateMemory } from './limits.ts'

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
  const limits = readLimits('{"limits":{"memory":"8g","memorySwap":"12g","cpus":6}}', 16)
  assert.deepEqual(limits, { limits: { memory: '8g', memorySwap: '12g', cpus: 6, usedDefaults: false } })
})

test('a silent manifest gets what the launcher gave it', () => {
  const limits = readLimits('{"node":"22"}', 16)
  assert.deepEqual(limits, { limits: { memory: '6g', memorySwap: '8g', cpus: undefined, usedDefaults: false } })
})

test('swap is derived from the memory that was asked for, not from the default', () => {
  assert.equal(readLimits('{"limits":{"memory":"10g"}}', 16).limits.memorySwap, '12g')
})

test('an unreadable manifest falls back and says that it did', () => {
  // The launcher fell back silently. This cannot: opening with 6g when the
  // file asked for 8 and saying nothing is what turns this into an
  // unexplained OOM three hours later.
  for (const broken of ['{"limits":', 'not json at all', '']) {
    const limits = readLimits(broken, 16)
    assert.equal(limits.limits.memory, '6g', broken)
    assert.equal(limits.limits.usedDefaults, true, `expected ${JSON.stringify(broken)} to be reported`)
    assert.equal(limits.refusal, undefined, broken)
  }
})

test('a manifest that is valid json but not an object is still a fallback', () => {
  assert.equal(readLimits('[1,2,3]', 16).limits.usedDefaults, true)
  assert.equal(readLimits('"a string"', 16).limits.usedDefaults, true)
})

test('a limit Docker would refuse is refused here, naming the field, the value and the form', () => {
  // gh-326: "6 GB" reached Docker as typed and failed at container creation,
  // inside Dev Containers, naming a flag and not this file. A number where a
  // size belongs would reach it as six bytes. Both are refused where the
  // manifest is read instead, and nothing is forwarded or silently defaulted.
  const cases: [string, string, string][] = [
    ['{"limits":{"memory":"6 GB"}}', 'limits.memory "6 GB" is not a size', 'memory with a space'],
    ['{"limits":{"memory":6}}', 'limits.memory 6 is not a size', 'memory as a number'],
    ['{"limits":{"memory":"6.5g"}}', 'limits.memory "6.5g" is not a size', 'a fraction of a unit'],
    ['{"limits":{"memorySwap":"lots"}}', 'limits.memorySwap "lots" is not a size', 'swap that is not a size'],
    ['{"limits":{"cpus":"four"}}', 'limits.cpus "four" is not a whole number', 'cores as a word'],
    ['{"limits":{"cpus":2.5}}', 'limits.cpus 2.5 is not a whole number', 'a fraction of a core'],
    ['{"limits":{"cpus":0}}', 'limits.cpus 0 is not a whole number', 'zero cores'],
  ]
  for (const [raw, expected, why] of cases) {
    const read = readLimits(raw, 16)
    assert.ok(read.refusal?.startsWith(expected), `${why}: ${read.refusal}`)
    assert.notEqual(read.limits.usedDefaults, true, why)
  }
})

test('a core count above the host is refused with the bound that applies', () => {
  // 64 cores asked of an 8-core host became --cpuset-cpus 0-63: Docker accepts
  // the flag and the container simply never runs there (gh-326).
  assert.equal(
    readLimits('{"limits":{"cpus":64}}', 8).refusal,
    'limits.cpus 64 is not a whole number of cores from 1 to 8',
  )
})

test('absent, null and empty limits are unset, not refusals', () => {
  // null is absent, the jq `// empty` semantics the rest of the manifest uses;
  // "" is what Configure writes when a box is cleared, and means the default.
  for (const raw of [
    '{"limits":{"memory":null,"memorySwap":null,"cpus":null}}',
    '{"limits":{"memory":"","memorySwap":""}}',
    '{"limits":{}}',
  ]) {
    const read = readLimits(raw, 16)
    assert.equal(read.refusal, undefined, raw)
    assert.equal(read.limits.memory, '6g', raw)
    assert.equal(read.limits.cpus, undefined, raw)
    assert.equal(read.limits.usedDefaults, false, raw)
  }
})

test('the size form Docker itself accepts passes', () => {
  for (const size of ['6g', '6G', '6gb', '6144m', '8192kb', '2147483648']) {
    assert.equal(readLimits(`{"limits":{"memory":"${size}"}}`, 16).refusal, undefined, size)
    assert.equal(readLimits(`{"limits":{"memory":"${size}"}}`, 16).limits.memory, size)
  }
})

test('the memory question refuses what Docker would, naming the form', () => {
  assert.equal(validateMemory(''), undefined)
  assert.equal(validateMemory('6g'), undefined)
  assert.equal(validateMemory('6144m'), undefined)
  assert.match(validateMemory('6 GB') ?? '', /Docker's size form/)
  assert.match(validateMemory('6.5g') ?? '', /no space/)
})

test('the cores question refuses outside the host count, naming the bound', () => {
  const check = validateCpus(8)
  assert.equal(check(''), undefined)
  assert.equal(check('4'), undefined)
  assert.equal(check('8'), undefined)
  assert.match(check('9') ?? '', /from 1 to 8/)
  assert.match(check('0') ?? '', /from 1 to 8/)
  assert.match(check('half') ?? '', /whole number/)
})
