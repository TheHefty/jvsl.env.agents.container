import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { parseIdea, readyProblems, IDEA_SECTIONS } from './contract.ts'

// --- the ideas have a contract (story 5kd.1, gh-364; task 5kd.1.1) -----------
//
// IDEA.md is a strict front-matter subset — a state and a one-level stacks map,
// no YAML dependency — then four sections. Ready requires all four, filled. The
// examples live in the plugin, beside where its own checker (5kd.1.2) reads
// them, so the two sides are held to the same files and the same expectations.
// The failures guarded: a valid idea refused for its whitespace, an invalid one
// let through because it looks close enough, and a ready idea missing a part.

const EXAMPLES = join(import.meta.dirname, '../../core/plugin/agent-container/ideas/examples')

interface Expect {
  valid: boolean
  state?: string
  project?: string
  stacks?: Record<string, string>
  problems?: { line: number | null; includes: string }[]
}

const examples = readdirSync(EXAMPLES).sort()

test('the shared examples are there, valid and invalid, so neither side can pass on none', () => {
  const expects = examples.map((name) => JSON.parse(readFileSync(join(EXAMPLES, name, 'expect.json'), 'utf8')) as Expect)
  assert.ok(expects.filter((e) => e.valid).length >= 3, 'at least three valid examples')
  assert.ok(expects.filter((e) => !e.valid).length >= 8, 'at least eight invalid examples')
})

for (const name of examples) {
  test(`example ${name} reads as its expect.json says`, () => {
    const want = JSON.parse(readFileSync(join(EXAMPLES, name, 'expect.json'), 'utf8')) as Expect
    const got = parseIdea(readFileSync(join(EXAMPLES, name, 'IDEA.md'), 'utf8'))
    if (want.valid) {
      assert.deepEqual(got.problems, [], `${name} should be valid`)
      assert.ok(got.idea, `${name} should parse into an idea`)
      assert.equal(got.idea.state, want.state)
      assert.equal(got.idea.project, want.project)
      assert.deepEqual(got.idea.stacks, want.stacks)
      return
    }
    const wanted = want.problems ?? []
    assert.equal(got.problems.length, wanted.length, `${name}: ${JSON.stringify(got.problems)}`)
    wanted.forEach((w, i) => {
      assert.equal(got.problems[i]?.line, w.line, `${name}: problem ${i} names line ${w.line}`)
      assert.ok(got.problems[i]?.message.includes(w.includes), `${name}: "${got.problems[i]?.message}" should name ${w.includes}`)
    })
  })
}

const whole = (): string => readFileSync(join(EXAMPLES, 'ready-whole/IDEA.md'), 'utf8')

test('the four sections, in their words', () => {
  assert.deepEqual([...IDEA_SECTIONS], ['Purpose and who it is for', 'Decisions and discarded alternatives', 'Stack', 'Open questions'])
})

test('a valid idea parses its sections into their text', () => {
  const { idea } = parseIdea(whole())
  assert.match(idea?.sections['Purpose and who it is for'] ?? '', /low vision/)
  assert.match(idea?.sections['Open questions'] ?? '', /OCR model/)
})

test('a byte-order mark, as an editor on Windows may save it, does not make a valid idea invalid', () => {
  assert.deepEqual(parseIdea('\uFEFF' + whole()).problems, [])
})

test('CRLF line endings and trailing spaces do not make a valid idea invalid', () => {
  const crlf = whole().replace(/\n/g, '\r\n').replace('state: ready', 'state: ready   ').replace('node: 22', 'node: 22\t')
  const got = parseIdea(crlf)
  assert.deepEqual(got.problems, [])
  assert.deepEqual(got.idea?.stacks, { node: '22', python: 'undecided' })
})

test('a stack with no version is refused, naming the line, and undecided is how to say there is none yet', () => {
  const got = parseIdea('---\nstate: raw\nstacks:\n  node:\n---\n')
  assert.equal(got.problems.length, 1)
  assert.equal(got.problems[0]?.line, 4)
  assert.match(got.problems[0]?.message ?? '', /undecided/)
})

test('the same stack twice is refused, naming the second line', () => {
  const got = parseIdea('---\nstate: raw\nstacks:\n  node: 22\n  node: 20\n---\n')
  assert.equal(got.problems[0]?.line, 5)
  assert.match(got.problems[0]?.message ?? '', /twice/)
})

test('became project names its project, and an empty name is refused', () => {
  assert.match(parseIdea('---\nstate: became project:\n---\n').problems[0]?.message ?? '', /project/)
  assert.equal(parseIdea('---\nstate: became project:   \n---\n').problems[0]?.line, 2)
})

test('an idea that is not ready may lack sections; marking it ready names each one missing', () => {
  const raw = parseIdea('---\nstate: exploring\n---\n\n## Stack\n\nNode.\n')
  assert.deepEqual(raw.problems, [])
  assert.ok(raw.idea)
  const missing = readyProblems(raw.idea).map((p) => p.message).join('\n')
  for (const s of ['Purpose and who it is for', 'Decisions and discarded alternatives', 'Open questions']) assert.match(missing, new RegExp(`## ${s}`))
  assert.doesNotMatch(missing, /## Stack/)
})

test('a section holding only blank lines and comments is empty', () => {
  const got = parseIdea(whole().replace(/## Open questions\n[\s\S]*$/, '## Open questions\n\n<!-- later -->\n\n'))
  assert.equal(got.problems.length, 1)
  assert.match(got.problems[0]?.message ?? '', /## Open questions.*empty/)
})

test('a heading of a different level does not count as the section', () => {
  const got = parseIdea(whole().replace('## Stack', '### Stack'))
  assert.match(got.problems.map((p) => p.message).join('\n'), /## Stack/)
})

test('an unknown key does not hide that the state is missing', () => {
  const got = parseIdea('---\nowner: someone\n---\n')
  assert.deepEqual(got.problems.map((p) => p.line), [2, null])
  assert.match(got.problems[1]?.message ?? '', /no state/)
})
