import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseVersion, readTemplateVersion } from './template.ts'

test('a version is parsed into something comparable', () => {
  assert.deepEqual(parseVersion('2.2.0'), { major: 2, minor: 2, patch: 0 })
  assert.deepEqual(parseVersion('10.0.3'), { major: 10, minor: 0, patch: 3 })
})

test('surrounding whitespace is what version.txt actually contains', () => {
  // The file is written by release-please and ends in a newline. A reader that
  // does not trim compares "2.2.0\n" and finds it unequal to everything.
  assert.deepEqual(parseVersion(' 2.2.0\n'), { major: 2, minor: 2, patch: 0 })
})

test('anything that is not a version parses to nothing rather than to zero', () => {
  // Returning a zeroed version would make every comparison say "too old",
  // which reads as a template problem rather than as an unreadable file.
  for (const bad of ['', 'v2.2.0', '2.2', 'latest', '2.2.0-rc1', 'two.two.zero']) {
    assert.equal(parseVersion(bad), null, `expected ${JSON.stringify(bad)} to parse to null`)
  }
})

test('the template version is read from the submodule', () => {
  const root = mkdtempSync(join(tmpdir(), 'tpl-'))
  mkdirSync(join(root, '.code-server'))
  writeFileSync(join(root, '.code-server', 'version.txt'), '2.2.0\n')
  assert.equal(readTemplateVersion(root), '2.2.0')
})

test('an uninitialized submodule reads as absent, not as an error', () => {
  // A fresh clone without --recursive leaves .code-server/ existing and empty.
  // Verified by hand; it is also why activation keys off the root manifest.
  const root = mkdtempSync(join(tmpdir(), 'tpl-'))
  mkdirSync(join(root, '.code-server'))
  assert.equal(readTemplateVersion(root), null)
})

test('no submodule directory at all reads as absent too', () => {
  const root = mkdtempSync(join(tmpdir(), 'tpl-'))
  assert.equal(readTemplateVersion(root), null)
})
