import { test } from 'node:test'
import assert from 'node:assert/strict'

import { appendAttempt, localTimestamp } from './attempts.ts'

// --- an attempt is never lost (story the-study-view) ---------------------------

const IDS = ['ex-1', 'q-1']

test('an attempt is appended, keeping every earlier one', () => {
  const first = appendAttempt(null, 'q-1', 'it fails', '2026-10-28T21:00:00-03:00', IDS)
  assert.ok(first.ok)
  const second = appendAttempt(first.text, 'q-1', 'index needs an array', '2026-10-28T21:05:00-03:00', IDS)
  assert.ok(second.ok)
  assert.deepEqual(JSON.parse(second.text), {
    'q-1': [
      { at: '2026-10-28T21:00:00-03:00', text: 'it fails' },
      { at: '2026-10-28T21:05:00-03:00', text: 'index needs an array' },
    ],
  })
})

test('an empty attempt is refused', () => {
  const r = appendAttempt(null, 'q-1', '   \n', '2026-10-28T21:00:00-03:00', IDS)
  assert.ok(!r.ok)
  assert.match(r.why, /empty/)
})

test('an attempt for an item the practice does not have is refused', () => {
  const r = appendAttempt(null, 'q-99', 'x', '2026-10-28T21:00:00-03:00', IDS)
  assert.ok(!r.ok)
  assert.match(r.why, /q-99/)
})

test('an attempts.json that does not parse, or break the contract, is never overwritten', () => {
  for (const bad of ['{"q-1": [', '{"q-1": [{"at": "yesterday", "text": "x"}]}', '[]']) {
    const r = appendAttempt(bad, 'q-1', 'x', '2026-10-28T21:00:00-03:00', IDS)
    assert.ok(!r.ok, bad)
    assert.match(r.why, /attempts\.json/)
  }
})

test("an attempt's time is local, with its offset", () => {
  const at = localTimestamp(new Date(Date.UTC(2026, 9, 29, 1, 0, 0)), -180)
  assert.equal(at, '2026-10-28T22:00:00-03:00')
  assert.equal(localTimestamp(new Date(Date.UTC(2026, 9, 28, 12, 0, 0)), 330), '2026-10-28T17:30:00+05:30')
})

// --- saving: the attempts are ignored before the first one is written ----------

import { saveAttempt } from './attempts.ts'
import type { ProjectFiles } from '../host/files.ts'

const recording = (initial: Record<string, string>, failOn?: string) => {
  const tree: Record<string, string> = { ...initial }
  const writes: string[] = []
  const files: ProjectFiles = {
    read: (rel) => tree[rel] ?? null,
    write: (rel, text) => {
      if (rel === failOn) throw new Error(`the WSL distro "Ubuntu" could not write /p/${rel}: disk full`)
      writes.push(rel)
      tree[rel] = text
    },
    exists: (rel) => rel in tree,
    list: () => null,
    mkdirAbsolute: () => undefined,
  }
  return { files, tree, writes }
}

test('the .gitignore line is written before the first attempt', () => {
  const { files, tree, writes } = recording({})
  const r = saveAttempt(files, 'labels', ['q-1'], 'q-1', 'it fails', '2026-10-28T21:00:00-03:00')
  assert.ok(r.ok)
  assert.deepEqual(writes, ['docs/study/.gitignore', 'docs/study/labels/attempts.json'])
  assert.equal(tree['docs/study/.gitignore'], '*/attempts.json\n')
})

test('a .gitignore that already ignores the attempts is not rewritten', () => {
  const { files, writes } = recording({ 'docs/study/.gitignore': 'notes\n*/attempts.json\n' })
  saveAttempt(files, 'labels', ['q-1'], 'q-1', 'x', '2026-10-28T21:00:00-03:00')
  assert.deepEqual(writes, ['docs/study/labels/attempts.json'])
})

test('a write that fails is reported, naming why, and no attempt is written after an unwritten .gitignore', () => {
  const { files, writes } = recording({}, 'docs/study/.gitignore')
  const r = saveAttempt(files, 'labels', ['q-1'], 'q-1', 'x', '2026-10-28T21:00:00-03:00')
  assert.ok(!r.ok)
  assert.match(r.why, /disk full/)
  assert.deepEqual(writes, [])
})
