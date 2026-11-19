import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { markBecameProject, markIdea } from './mark.ts'
import { IDEAS_PATH } from './offer.ts'
import { parseIdea } from './contract.ts'

// --- a project from an idea marks the original (story 5kd.5, gh-364; task
// a-project-from-an-idea-copies-it-and-marks-the-original) ------------------
//
// After Create starts from an idea, the original in the developer's ideas
// folder reads `state: became project: <name>`, so it is not offered again and
// the Brainstorm container knows where it went. The failures guarded: the
// mark rewriting anything but the state line; a mark written over an edit made
// while Create ran; a mark that cannot be written undoing or stopping Create.

const EXAMPLES = join(import.meta.dirname, '../../core/plugin/agent-container/ideas/examples')
const whole = readFileSync(join(EXAMPLES, 'ready-whole/IDEA.md'), 'utf8')

test('the mark changes the state line and nothing else', () => {
  const marked = markBecameProject(whole, 'receipt-reader')
  assert.ok(typeof marked === 'string')
  const before = whole.split('\n')
  const after = (marked).split('\n')
  assert.equal(after.length, before.length)
  const changed = after.map((l, i) => (l === before[i] ? null : i)).filter((i) => i !== null)
  assert.deepEqual(changed, [1])
  assert.equal(after[1], 'state: became project: receipt-reader')
  const { idea, problems } = parseIdea(marked)
  assert.deepEqual(problems, [])
  assert.equal(idea?.state, 'became project')
  assert.equal(idea?.project, 'receipt-reader')
})

test('CRLF line endings are kept', () => {
  const marked = markBecameProject(whole.replace(/\n/g, '\r\n'), 'app') as string
  assert.ok(marked.includes('state: became project: app\r\n'))
  assert.ok(!/[^\r]\n/.test(marked))
})

test('an idea whose state cannot be found is not marked, and says why', () => {
  const r = markBecameProject('# no front matter\n', 'app')
  assert.ok(typeof r === 'object' && /state/.test(r.error))
})

const store = (files: Record<string, string>, fail?: string) => ({
  read: (rel: string) => files[rel] ?? null,
  write: (rel: string, text: string) => { if (fail) throw new Error(fail); files[rel] = text },
})
const at = `${IDEAS_PATH}/receipt-reader/IDEA.md`

test('the mark is written over the idea as it is now, keeping an edit made while Create ran', () => {
  const files = { [at]: whole.replace('None left.', 'None left.\n') + '\nAdded while Create asked its questions.\n' }
  const r = markIdea(store(files), 'receipt-reader', 'receipt-reader')
  assert.deepEqual(r, { ok: true })
  assert.match(files[at], /^state: became project: receipt-reader$/m)
  assert.match(files[at], /Added while Create asked its questions/)
})

test('an idea gone since it was offered is said, not recreated', () => {
  const files: Record<string, string> = {}
  const r = markIdea(store(files), 'receipt-reader', 'receipt-reader')
  assert.ok('error' in r && /no longer/.test(r.error))
  assert.equal(at in files, false)
})

test('a write that fails is said, and does not throw', () => {
  const r = markIdea(store({ [at]: whole }, 'EACCES: permission denied'), 'receipt-reader', 'receipt-reader')
  assert.ok('error' in r && /permission denied/.test(r.error))
})
