import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, cpSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { checkTopic, checkTopicWith, GUIDE_SECTIONS } from '../../core/plugin/agent-container/study/validate.mjs'

// --- the study material's contract (story the-study-material-has-a-contract) ---
//
// Since 2026-10-28 a topic is its guide alone (task the-practice-leaves-the-study).
// One checker, run by the study skill in the container and bundled into the
// extension for the Study view, so the two cannot disagree about what a valid
// topic is. The failures it guards: a broken guide shown as if it were whole,
// a whole one refused, and a topic built before the change refused for files it
// no longer needs.

const STUDY = join(import.meta.dirname, '../../core/plugin/agent-container/study')
const EXAMPLE = join(STUDY, 'example/bd-labels-are-null')
const guide = (): string => readFileSync(join(EXAMPLE, 'guide.md'), 'utf8')
const topicWith = (change: (dir: string) => void): string => {
  const dir = join(mkdtempSync(join(tmpdir(), 'study-')), 'bd-labels-are-null')
  cpSync(EXAMPLE, dir, { recursive: true })
  change(dir)
  return dir
}
const problems = (dir: string): string => checkTopic(dir).map((e) => `${e.file}: ${e.message}`).join('\n')

test('the example topic is valid: a guide with its seven sections, in order', () => {
  assert.deepEqual(checkTopic(EXAMPLE), [])
  assert.equal(GUIDE_SECTIONS.length, 7)
})

test('a guide missing a section is reported, naming it', () => {
  const dir = topicWith((d) => writeFileSync(join(d, 'guide.md'), guide().replace(/## Sources\n[\s\S]*?(?=## Points for the post)/, '')))
  assert.match(problems(dir), /guide\.md: .*Sources/)
})

test('a guide with its sections out of order is reported', () => {
  const swapped = guide().replace('## Fundamentals', '## TMP').replace('## The problem', '## Fundamentals').replace('## TMP', '## The problem')
  const dir = topicWith((d) => writeFileSync(join(d, 'guide.md'), swapped))
  assert.match(problems(dir), /guide\.md: .*order/)
})

test('a topic with no guide is reported, not shown as empty', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'study-')), 'empty-topic')
  cpSync(EXAMPLE, dir, { recursive: true, filter: (src) => !src.endsWith('guide.md') })
  assert.match(problems(dir), /guide\.md: .*missing/)
})

test('a topic built before the practice left still validates: its leftover files are ignored, not refused', () => {
  const dir = topicWith((d) => {
    writeFileSync(join(d, 'practice.json'), '{"topic": "bd-labels-are-null", "items": [ broken')
    writeFileSync(join(d, 'attempts.json'), '{"q-1": [{"at": "yesterday"}]}')
  })
  assert.deepEqual(checkTopic(dir), [])
})

test('a topic read through a function gives what the folder gives', () => {
  const read = (name: string): string | null => (name === 'guide.md' ? guide() : null)
  assert.deepEqual(checkTopicWith(read, 'bd-labels-are-null'), [])
  assert.match(checkTopicWith(() => null, 'x').map((p) => p.message).join(), /missing/)
})

test('loading the module reads no file and resolves no path: both wait until asked', () => {
  // Bundled into the extension as CommonJS, import.meta.url is undefined and
  // the module's folder is dist/; anything evaluated at import stops activation.
  const source = readFileSync(join(STUDY, 'validate.mjs'), 'utf8')
  const evaluatedAtImport = (l: string) => {
    const arrow = l.indexOf('=>')
    const at = l.search(/readFileSync|import\.meta|fileURLToPath\(/)
    return at >= 0 && (arrow < 0 || at < arrow)
  }
  assert.deepEqual(source.split('\n').filter((l) => /^(const|let|var) /.test(l) && evaluatedAtImport(l)), [])
})
