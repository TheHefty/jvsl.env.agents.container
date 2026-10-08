import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkLocation, aiMemoryMarker } from './location.ts'

test('a directory that does not exist yet is accepted', () => {
  // Creating a project is the common case, and the common case is a path
  // somebody typed that nothing has made yet.
  const root = mkdtempSync(join(tmpdir(), 'loc-'))
  const r = checkLocation(join(root, 'a-new-project'))
  assert.equal(r.usable, true)
})

test('an empty directory is accepted', () => {
  const root = mkdtempSync(join(tmpdir(), 'loc-'))
  assert.equal(checkLocation(root).usable, true)
})

test('a directory with anything in it is refused, naming what it found', () => {
  // **The destructive case this story exists to refuse.** Scaffolding writes a
  // manifest, two instruction files and a first commit; doing that over
  // somebody's work is not recoverable by trying again.
  const root = mkdtempSync(join(tmpdir(), 'loc-'))
  writeFileSync(join(root, 'README.md'), '# theirs\n')
  const r = checkLocation(root)
  assert.equal(r.usable, false)
  assert.match(r.because ?? '', /README\.md/)
})

test('a dotfile counts as something in it', () => {
  // `readdir` without care skips nothing, but a check written with a glob
  // would: a directory holding only `.git` is a repository, and it is the one
  // that most looks empty.
  const root = mkdtempSync(join(tmpdir(), 'loc-'))
  mkdirSync(join(root, '.git'))
  const r = checkLocation(root)
  assert.equal(r.usable, false)
  assert.match(r.because ?? '', /\.git/)
})

test('a path that is a file is refused for being a file', () => {
  const root = mkdtempSync(join(tmpdir(), 'loc-'))
  const f = join(root, 'not-a-directory')
  writeFileSync(f, 'x')
  const r = checkLocation(f)
  assert.equal(r.usable, false)
  assert.match(r.because ?? '', /file/i)
})

test('a refusal does not read as a defect in the extension', () => {
  const root = mkdtempSync(join(tmpdir(), 'loc-'))
  writeFileSync(join(root, 'something'), 'x')
  const r = checkLocation(root)
  assert.doesNotMatch(r.because ?? '', /error|failed|broken|invalid/i)
})

test('the ai-memory marker says what it switches on', () => {
  // **It is TOML the service reads, not a flag.** A zero-byte file would switch
  // memory on and tell the next reader nothing about why.
  const m = aiMemoryMarker()
  assert.match(m, /project_strategy/)
  assert.ok(m.split('\n').filter((l) => l.startsWith('#')).length >= 3, m)
  assert.match(m, /off in a project that does not carry|not carry this file/i)
})
