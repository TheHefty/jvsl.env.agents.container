import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { validate, checkTopic, checkTopicWith, loadSchemas, withAttemptsIgnored } from '../../core/plugin/agent-container/study/validate.mjs'

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

// --- answers never leak into the guide (story the-study-skill-builds-a-topic) ---
//
// A guide that states an answer makes the practice a reading exercise. Checked
// verbatim, ignoring case and spacing: a rephrasing is a judgement, and an
// answer under 12 characters ("null", "8080") cannot be told from prose.

test('an answer copied into the guide is reported, naming its item, whatever its case and spacing', () => {
  const dir = topicWith((d) => {
    const answer = example().items.find((i) => i.id === 'q-3')!.answer as string
    const shouted = answer.toUpperCase().replace(/ /g, '   ')
    writeFileSync(join(d, 'guide.md'), readFileSync(join(d, 'guide.md'), 'utf8').replace('## Sources\n', `## Sources\n\n${shouted}\n`))
  })
  assert.match(problems(dir), /guide\.md: .*contains the answer to "q-3"/)
})

test('an answer that lives only in practice.json is not a leak', () => {
  assert.deepEqual(checkTopic(EXAMPLE), [])
})

test('a short answer is not checked, so ordinary prose is never flagged', () => {
  const p = example()
  p.items[2]!.answer = 'It fails.'
  const dir = topicWith((d) => {
    writeJson(d, 'practice.json', p)
    writeFileSync(join(d, 'guide.md'), readFileSync(join(d, 'guide.md'), 'utf8').replace('## Sources\n', '## Sources\n\nIt fails.\n'))
  })
  assert.deepEqual(checkTopic(dir), [])
})

// --- read through a function, for a WSL project (story the-study-view) ---------
//
// The extension does not read a WSL project with node's fs: src/host/files.ts
// goes through wsl.exe. So the view checks a topic through the reader it is
// given, with the schemas loaded from the extension's own copy of core/.

test('a topic read through a function gives what the folder gives', () => {
  const read = (name: string): string | null => {
    try { return readFileSync(join(EXAMPLE, name), 'utf8') } catch { return null }
  }
  assert.deepEqual(checkTopicWith(read, 'bd-labels-are-null', loadSchemas(STUDY)), [])
  const broken = (name: string) => (name === 'practice.json' ? '{"topic": ' : read(name))
  assert.match(messages(checkTopicWith(broken, 'bd-labels-are-null', loadSchemas(STUDY))), /not valid JSON/)
})

test('loading the module reads no file and resolves no path: both wait until the CLI asks', () => {
  // Bundled into the extension the module's own folder is dist/, where no
  // schema is. A read at import would stop the extension activating.
  const source = readFileSync(join(STUDY, 'validate.mjs'), 'utf8')
  // A top-level line that reaches the disk or the module's URL before any arrow:
  // inside a function it waits to be called; outside one it runs at import.
  const evaluatedAtImport = (l: string) => {
    const arrow = l.indexOf('=>')
    const at = l.search(/readFileSync|import\.meta|fileURLToPath\(/)
    return at >= 0 && (arrow < 0 || at < arrow)
  }
  const topLevel = source.split('\n').filter((l) => /^(const|let|var) /.test(l) && evaluatedAtImport(l))
  assert.deepEqual(topLevel, [])
})

// --- the attempts are ignored, by one rule -------------------------------------

test('a .gitignore gains the attempts line once, keeping its own lines and its last line whole', () => {
  assert.equal(withAttemptsIgnored(null), '*/attempts.json\n')
  assert.equal(withAttemptsIgnored('build/'), 'build/\n*/attempts.json\n')
  assert.equal(withAttemptsIgnored('notes.txt\n*/attempts.json\n'), 'notes.txt\n*/attempts.json\n')
})
