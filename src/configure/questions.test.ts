import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  limitDefaults,
  missingDependencies,
  orderedVersions,
  nextManifest,
  stacksAvailable,
  versionsOf,
  type Answers,
} from './questions.ts'

/**
 * The questions the editor asks, as the parts of them that can be wrong.
 *
 * None of this needs an editor, and that is the point rather than a
 * convenience: the two failures worth preventing are a dropped manifest key and
 * a stack list that does not come from the stacks directory, and neither
 * involves a picker. What a mock of `showQuickPick` would assert is that a pure
 * function was called with what it returned.
 */

/** A stacks directory this test builds, so "the list is the directories" means something. */
function fixture(stacks: Record<string, { versions: string[]; requires?: string[] }>): string {
  const root = mkdtempSync(join(tmpdir(), 'questions-'))
  const stacksDir = join(root, 'stacks')
  for (const [name, spec] of Object.entries(stacks)) {
    mkdirSync(join(stacksDir, name), { recursive: true })
    writeFileSync(join(stacksDir, name, 'versions.json'), JSON.stringify(spec.versions))
    if (spec.requires) {
      writeFileSync(join(stacksDir, name, 'requires.json'), JSON.stringify(spec.requires))
    }
  }
  mkdirSync(stacksDir, { recursive: true })
  return stacksDir
}

test('the available stacks are the directories that exist', () => {
  const dir = fixture({ java: { versions: ['17', '21'] }, rust: { versions: ['1.83'] } })
  assert.deepEqual(stacksAvailable(dir), ['java', 'rust'])

  // Added after the fixture was built, which is the shape of a stack added to
  // the template: it has to appear here with no change on this side.
  mkdirSync(join(dir, 'zig'), { recursive: true })
  writeFileSync(join(dir, 'zig', 'versions.json'), '["0.13"]')
  assert.deepEqual(stacksAvailable(dir), ['java', 'rust', 'zig'])
})

test('an empty stacks directory is distinguishable from no stacks selected', () => {
  // The case that reads as a broken extension rather than a missing checkout:
  // `.code-server/` exists and is empty until the submodule is initialised.
  const dir = fixture({})
  assert.deepEqual(stacksAvailable(dir), [])
})

test('the versions offered are the stack\'s own, in the file\'s order', () => {
  // The order is load-bearing: "the lowest listed" is how both this and `setup`
  // default a stack the manifest does not mention.
  const dir = fixture({ java: { versions: ['17', '21'] } })
  assert.deepEqual(versionsOf(dir, 'java'), ['17', '21'])
  assert.deepEqual(versionsOf(dir, 'nosuch'), [])
})

test('a missing dependency is reported with both names', () => {
  const dir = fixture({
    android: { versions: ['34'], requires: ['java'] },
    java: { versions: ['17', '21'] },
  })
  assert.deepEqual(missingDependencies(['android'], dir), [{ stack: 'android', needs: 'java' }])
})

test('a satisfied dependency reports nothing', () => {
  // The negative case, so the check is not vacuously true for every selection.
  const dir = fixture({
    android: { versions: ['34'], requires: ['java'] },
    java: { versions: ['17', '21'] },
  })
  assert.deepEqual(missingDependencies(['android', 'java'], dir), [])
  assert.deepEqual(missingDependencies(['java'], dir), [])
})

const answers: Answers = {
  stacks: { node: '22' },
  limits: { memory: '6g' },
}

test('an unknown key survives being written', () => {
  // The regression this repository has already had: the manifest is the only
  // per-project record of intent, and rebuilding it from the answers blocked a
  // feature once by silently dropping what a project had put there.
  const current = {
    node: '20',
    java: '21',
    limits: { memory: '4g' },
    publishCodeServerPort: true,
    teamNotes: { why: 'kept by hand, on purpose' },
  }
  const next = nextManifest(current, answers, ['java', 'node', 'rust'])
  assert.equal(next.publishCodeServerPort, true)
  assert.deepEqual(next.teamNotes, { why: 'kept by hand, on purpose' })
})

test('a deselected stack is removed', () => {
  // The other half of the same mechanism, and the reason keys are stripped by
  // name rather than the file being rebuilt from what was selected.
  const current = { node: '20', java: '21' }
  const next = nextManifest(current, answers, ['java', 'node', 'rust'])
  assert.equal(next.node, '22')
  assert.ok(!('java' in next), JSON.stringify(next))
})

test('limits is replaced rather than merged', () => {
  // `setup` writes it whole. Two shapes of the same field, depending on which
  // door the answer came through, is worse than either shape.
  const current = { limits: { memory: '4g', memorySwap: '6g', cpus: 8 } }
  const next = nextManifest(current, { stacks: {}, limits: { memory: '6g' } }, ['java'])
  assert.deepEqual(next.limits, { memory: '6g' })
})

test('a stack the manifest does not mention takes the lowest version listed', () => {
  const dir = fixture({ java: { versions: ['17', '21'] } })
  assert.equal(versionsOf(dir, 'java')[0], '17')
})

test('the recorded version is offered first', () => {
  // The scenario this was missing a test for: "each question defaults to what the
  // manifest already says". Without the default every rerun retypes everything,
  // which is how a tool stops being rerun.
  assert.deepEqual(orderedVersions(['17', '21'], '21'), ['21', '17'])
  assert.deepEqual(orderedVersions(['17', '21'], '17'), ['17', '21'])
})

test('with nothing recorded the list is the file\'s order, so the lowest is first', () => {
  // The same default `setup` uses for a stack the manifest does not mention. Both
  // doors agree because both read the file in order.
  assert.deepEqual(orderedVersions(['17', '21']), ['17', '21'])
})

test('a recorded version the stack no longer offers is still offered first', () => {
  // A project pinned to something since dropped sees what it has rather than
  // silently moving. `setup` refuses it, which is the louder half of the same
  // answer; here it is visible and the choice stays the person's.
  assert.deepEqual(orderedVersions(['21'], '17'), ['17', '21'])
})

test('the memory default is 6g, which is what setup uses', () => {
  // These two numbers live in two repositories and have to agree. Until this
  // function they were a literal in the editor's wiring and a literal in a shell
  // script.
  assert.deepEqual(limitDefaults(null), { memory: '6g', memorySwap: '', cpus: '' })
  assert.deepEqual(limitDefaults({}), { memory: '6g', memorySwap: '', cpus: '' })
})

test('the manifest\'s own limits are the defaults when it has them', () => {
  assert.deepEqual(limitDefaults({ limits: { memory: '8g', memorySwap: '10g', cpus: 6 } }), {
    memory: '8g',
    memorySwap: '10g',
    cpus: '6',
  })
})

test('an absent swap or cpus is empty rather than invented', () => {
  // Empty is what both sides read as "derive it": the client derives swap from
  // memory and cpus from the host. A number here would pin what should float.
  assert.deepEqual(limitDefaults({ limits: { memory: '8g' } }), {
    memory: '8g',
    memorySwap: '',
    cpus: '',
  })
})

test('the answers carry a location and the ai-memory choice', () => {
  const a: Answers = {
    stacks: { java: '21' },
    limits: { memory: '6g' },
    location: '/work/a-new-project',
    aiMemory: true,
  }
  assert.equal(a.location, '/work/a-new-project')
  assert.equal(a.aiMemory, true)
})

test('neither the location nor the ai-memory choice reaches the manifest', () => {
  // **They are answers about where and whether, not about what the image
  // contains.** A manifest carrying a location would be one machine's path in a
  // tracked file — the same defect that keeps the generated dev container
  // configuration out of version control. And ai-memory is switched by a
  // marker file the image's boot hook reads, not by a manifest key nothing
  // reads.
  const next = nextManifest({}, {
    stacks: { java: '21' },
    limits: { memory: '6g' },
    location: '/work/a-new-project',
    aiMemory: true,
  }, ['java'])
  const serialised = JSON.stringify(next)
  assert.doesNotMatch(serialised, /a-new-project/)
  assert.doesNotMatch(serialised, /aiMemory|ai-memory/i)
})

test('a cpus written as an object is not offered back as a default (it would read [object Object])', () => {
  // Found by the lint (no-base-to-string) on 2026-10-09.
  assert.equal(limitDefaults({ limits: { cpus: { count: 4 } } }).cpus, '')
  assert.equal(limitDefaults({ limits: { cpus: 4 } }).cpus, '4')
})
