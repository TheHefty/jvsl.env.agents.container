import { test } from 'node:test'
import assert from 'node:assert/strict'

import { carried } from './template.ts'

test('carried() resolves under the extension, never under the workspace', () => {
  const got = carried('/home/me/.vscode/extensions/jvsl-0.3.0', 'core', 'Dockerfile.frag')
  assert.equal(got, '/home/me/.vscode/extensions/jvsl-0.3.0/core/Dockerfile.frag')
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
