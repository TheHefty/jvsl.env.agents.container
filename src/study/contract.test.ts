import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { validate, checkTopic } from '../../core/plugin/agent-container/study/validate.mjs'

// --- the study contract (story the-study-material-has-a-contract) --------------
//
// One validator, read by the study skill in the container and bundled into the
// extension for the Study view, interpreting the schema files themselves. The
// failures it guards: invalid material accepted, so a topic shows answers it
// should not or none at all; valid material refused; and a rule in the schema
// that nothing enforces.

const STUDY = join(import.meta.dirname, '../../core/plugin/agent-container/study')
const EXAMPLE = join(STUDY, 'example/bd-labels-are-null')
const practiceSchema = JSON.parse(readFileSync(join(STUDY, 'practice.schema.json'), 'utf8')) as object
const attemptsSchema = JSON.parse(readFileSync(join(STUDY, 'attempts.schema.json'), 'utf8')) as object
const example = (): { topic: string; items: Record<string, unknown>[] } =>
  JSON.parse(readFileSync(join(EXAMPLE, 'practice.json'), 'utf8')) as { topic: string; items: Record<string, unknown>[] }

const messages = (errors: { path: string; message: string }[]): string => errors.map((e) => `${e.path}: ${e.message}`).join('\n')

test('the example topic is valid, both its practice and the whole folder', () => {
  assert.deepEqual(validate(practiceSchema, example()), [])
  assert.deepEqual(checkTopic(EXAMPLE), [])
})

const broken: [string, (p: ReturnType<typeof example>) => void, RegExp][] = [
  ['one exercise only', (p) => { p.items = p.items.filter((i) => i.id !== 'ex-2') }, /\/items: .*at least 2 .*exercise/],
  ['five exercises', (p) => { for (const n of [3, 4, 5]) p.items.push({ ...p.items[0], id: `ex-${n}` }) }, /\/items: .*at most 4 .*exercise/],
  ['four questions', (p) => { p.items = p.items.filter((i) => i.id !== 'q-3') }, /\/items: .*at least 5 .*question/],
  ['nine questions', (p) => { for (const n of [6, 7, 8, 9]) p.items.push({ ...p.items[2], id: `q-${n}` }) }, /\/items: .*at most 8 .*question/],
  ['no "what if" variation', (p) => { for (const i of p.items) i.variation = false }, /\/items: .*variation/],
  ['no "when not to use" question', (p) => { for (const i of p.items) delete i.angle }, /\/items: .*when-not-to-use/],
  ['a property the contract does not have', (p) => { (p.items[0] as Record<string, unknown>).hint = 'x' }, /\/items\/0: .*hint/],
  ['an empty answer', (p) => { p.items[0]!.answer = '' }, /\/items\/0\/answer: /],
  ['a level of 4', (p) => { p.items[0]!.level = 4 }, /\/items\/0\/level: /],
  ['an id that is not a slug', (p) => { p.items[0]!.id = 'Ex 1' }, /\/items\/0\/id: /],
  ['a kind the contract does not have', (p) => { p.items[0]!.kind = 'quiz' }, /\/items\/0\/kind: /],
  ['no topic', (p) => { delete (p as Partial<typeof p>).topic }, /^: .*topic/m],
]
for (const [name, breakIt, expected] of broken) {
  test(`a practice set with ${name} is reported, at its path`, () => {
    const p = example()
    breakIt(p)
    const errors = validate(practiceSchema, p)
    assert.ok(errors.length > 0, `${name} was accepted`)
    assert.match(messages(errors), expected)
  })
}

test('an attempt needs a date-time and some text', () => {
  assert.deepEqual(validate(attemptsSchema, { 'q-1': [{ at: '2026-10-28T21:00:00-03:00', text: 'it fails' }] }), [])
  assert.match(messages(validate(attemptsSchema, { 'q-1': [{ at: 'yesterday', text: 'x' }] })), /\/q-1\/0\/at: /)
  assert.match(messages(validate(attemptsSchema, { 'q-1': [{ at: '2026-10-28T21:00:00Z', text: '' }] })), /\/q-1\/0\/text: /)
})

test('a keyword the validator does not know is an error, never a rule silently skipped', () => {
  const errors = validate({ type: 'object', uniqueItems: true }, {})
  assert.match(messages(errors), /unsupported schema keyword "uniqueItems"/)
})

// The three rules a schema cannot say, and the guide's sections.
const topicWith = (change: (dir: string) => void): string => {
  const dir = join(mkdtempSync(join(tmpdir(), 'study-')), 'bd-labels-are-null')
  cpSync(EXAMPLE, dir, { recursive: true })
  change(dir)
  return dir
}
const problems = (dir: string): string => checkTopic(dir).map((e) => `${e.file}: ${e.path}: ${e.message}`).join('\n')
const writeJson = (dir: string, file: string, data: unknown): void => writeFileSync(join(dir, file), JSON.stringify(data))

test('a topic whose name is not its folder is reported', () => {
  const dir = topicWith((d) => writeJson(d, 'practice.json', { ...example(), topic: 'another-topic' }))
  assert.match(problems(dir), /practice\.json: \/topic: .*folder/)
})

test('two items with one id are reported', () => {
  const p = example()
  p.items[1]!.id = 'ex-1'
  const dir = topicWith((d) => writeJson(d, 'practice.json', p))
  assert.match(problems(dir), /practice\.json: \/items\/1\/id: .*ex-1.*twice|duplicate/)
})

test('an attempt for an item the practice does not have is reported', () => {
  const dir = topicWith((d) => writeJson(d, 'attempts.json', { 'q-99': [{ at: '2026-10-28T21:00:00Z', text: 'x' }] }))
  assert.match(problems(dir), /attempts\.json: \/q-99: /)
})

test('a guide missing a section, or with them out of order, is reported', () => {
  const missing = topicWith((d) => {
    const g = readFileSync(join(d, 'guide.md'), 'utf8').replace(/## Sources\n[\s\S]*?(?=## Points for the post)/, '')
    writeFileSync(join(d, 'guide.md'), g)
  })
  assert.match(problems(missing), /guide\.md: .*Sources/)
  const swapped = topicWith((d) => {
    const g = readFileSync(join(d, 'guide.md'), 'utf8').replace('## Fundamentals', '## TMP').replace('## The problem', '## Fundamentals').replace('## TMP', '## The problem')
    writeFileSync(join(d, 'guide.md'), g)
  })
  assert.match(problems(swapped), /guide\.md: .*order/)
})

test('a topic with no practice.json is reported; one with no attempts yet is not', () => {
  assert.match(problems(topicWith((d) => rmSync(join(d, 'practice.json')))), /practice\.json: .*missing/)
  assert.deepEqual(checkTopic(topicWith(() => undefined)), [])
})

test('an unreadable practice.json is reported as such, not as an empty topic', () => {
  const dir = topicWith((d) => writeFileSync(join(d, 'practice.json'), '{"topic": '))
  assert.match(problems(dir), /practice\.json: .*not valid JSON/)
})
