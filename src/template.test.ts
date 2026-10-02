import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { isAtLeast, parseVersion, readTemplateVersion } from './template.ts'

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

/**
 * Ordering is where an off-by-one is invisible, so the four versions that break
 * the two naive implementations are named rather than left to a generic case.
 */
test('a version at or above the minimum is accepted', () => {
  assert.equal(isAtLeast('5.0.0', '5.0.0'), true, 'exactly the minimum')
  assert.equal(isAtLeast('5.0.1', '5.0.0'), true)
  assert.equal(isAtLeast('5.1.0', '5.0.0'), true)
  assert.equal(isAtLeast('6.0.0', '5.0.0'), true)
})

test('a version below the minimum is not', () => {
  // `4.9.0 < 5.0.0` is what a string compare gets wrong: '4' sorts before '5'
  // only by luck, and '10' sorts before '9'.
  assert.equal(isAtLeast('4.9.0', '5.0.0'), false, 'the string-compare trap')
  assert.equal(isAtLeast('2.2.0', '5.0.0'), false)
  assert.equal(isAtLeast('5.0.0', '5.0.1'), false)
  assert.equal(isAtLeast('5.0.0', '5.1.0'), false)
})

test('a two-digit major is not read as a smaller one', () => {
  // `10.0.0 vs 9.0.0` is what a numeric-prefix or lexical compare gets wrong.
  assert.equal(isAtLeast('10.0.0', '9.0.0'), true, 'the numeric-prefix trap')
  assert.equal(isAtLeast('9.0.0', '10.0.0'), false)
  assert.equal(isAtLeast('5.10.0', '5.9.0'), true)
  assert.equal(isAtLeast('5.0.10', '5.0.9'), true)
})

test('an unparseable version is never at least anything', () => {
  // Null rather than a zeroed version, for the reason parseVersion already
  // gives: a zeroed one compares as older and hides the difference between
  // "old" and "unreadable", which are different fixes.
  for (const bad of ['', 'latest', '5.0', 'v5.0.0', '5.0.0-rc1']) {
    assert.equal(isAtLeast(bad, '5.0.0'), false, bad)
  }
  assert.equal(isAtLeast('5.0.0', 'nonsense'), false, 'a nonsense minimum refuses too')
})
