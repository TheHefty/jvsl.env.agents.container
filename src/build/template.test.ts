import { test } from 'node:test'
import assert from 'node:assert/strict'

import {isAtLeast, parseVersion, carried} from './template.ts'

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

test('carried() resolves under the extension, never under the workspace', () => {
  const got = carried('/home/me/.vscode/extensions/jvsl-0.3.0', 'core', 'compose-dockerfile.sh')
  assert.equal(got, '/home/me/.vscode/extensions/jvsl-0.3.0/core/compose-dockerfile.sh')
})

test('carried() is the same expression in a checkout and in an installation', () => {
  // True by a coincidence of two decisions and nothing holds it true on
  // purpose: story 1 merged core/ and stacks/ at their original paths rather
  // than under a prefix, so the repository root and an installation directory
  // have the same shape. The package assertion in tools/vsix.test.ts is the
  // half of this that reads the artifact; this half pins the expression.
  const inCheckout = carried('/src/jvsl.env.agents.container', 'core')
  const installed = carried('/home/me/.vscode/extensions/jvsl-0.3.0', 'core')
  assert.equal(inCheckout.slice('/src/jvsl.env.agents.container'.length), '/core')
  assert.equal(installed.slice('/home/me/.vscode/extensions/jvsl-0.3.0'.length), '/core')
})
