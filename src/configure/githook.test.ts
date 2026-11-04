import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { HOOK_PATH, hookWrite, isOurHook } from './githook.ts'

// Story the-markdown-size-check-runs-on-every-commit-in-a-project (epic qws,
// task qws.1.1): Create and Configure write .githooks/pre-commit, and never
// over a hook somebody wrote.

const asset = readFileSync(join(import.meta.dirname, '..', '..', 'assets', 'project', 'githooks-pre-commit'), 'utf8')

test('the hook is written where git will be pointed at it', () => {
  assert.equal(HOOK_PATH, '.githooks/pre-commit')
})

test('a project with no hook gets ours', () => {
  const w = hookWrite(null, asset)
  assert.equal(w.action, 'write')
  assert.equal(w.contents, asset)
})

test('failure 1: a hook somebody wrote is never replaced, and the reason says so', () => {
  const theirs = '#!/bin/sh\nnpm test\n'
  const w = hookWrite(theirs, asset)
  assert.equal(w.action, 'keep')
  assert.match(w.because ?? '', /did not write it/)
  assert.match(w.because ?? '', /check-md-size/)
})

test('our own hook is brought up to date', () => {
  const older = '#!/bin/sh\n# jvsl.env.agents.container: generated. Do not edit.\ncheck-md-size\n'
  assert.ok(isOurHook(older))
  assert.equal(hookWrite(older, asset).action, 'write')
})

test('failure 3: the hook is a POSIX script with LF endings and carries the marker', () => {
  assert.ok(asset.startsWith('#!/bin/sh\n'), 'a shebang git can run')
  assert.ok(!asset.includes('\r'), 'no CR: a CRLF shebang is "/bin/sh\\r", which nothing runs')
  assert.ok(isOurHook(asset))
  assert.match(asset, /check-md-size/)
  assert.match(asset, /split-markdown/)
})
