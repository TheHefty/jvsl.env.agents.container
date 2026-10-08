import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { composeForProject } from './build.ts'

/**
 * Issue #158, debt the-build-composes-no-stack: kotodori's rebuilt image had no
 * JDK although its manifest selected java. Driven the way a real build runs:
 * the project's manifest as the configure command writes it, the stacks the
 * extension carries, and the composer itself, whose output is the Dockerfile
 * `docker build` is given.
 */
const EXTENSION = fileURLToPath(new URL('../..', import.meta.url))

function composed(manifest: Record<string, unknown>): { stacks: string[]; dockerfile: string } {
  const root = mkdtempSync(join(tmpdir(), 'compose-project-'))
  writeFileSync(join(root, '.agent-container.stack.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const c = composeForProject(EXTENSION, root)
  const dockerfile = execFileSync(c.script, c.stacks, {
    encoding: 'utf8', env: { ...process.env, STACK_MANIFEST: c.manifest }, maxBuffer: 16 * 1024 * 1024,
  })
  return { stacks: c.stacks, dockerfile }
}

test("kotodori's manifest composes the java stack it selects, at its version", () => {
  // As kotodori's manifest stood on 2026-10-08, with the version it pins (21).
  const r = composed({ java: '21', node: '22', python: '3.13', limits: { memory: '8g' }, beads: true })
  assert.deepEqual([...r.stacks].sort(), ['java', 'node', 'python'])
  assert.match(r.dockerfile, /openjdk-21-jdk/, 'the composed Dockerfile installs the JDK the manifest selects')
})

test('keys that are not stacks are never composed as one', () => {
  const r = composed({ node: '24', limits: { memory: '6g' }, beads: true, somethingElse: 'x' })
  assert.deepEqual(r.stacks, ['node'])
})

test('a manifest selecting nothing composes core alone', () => {
  assert.deepEqual(composed({ limits: { memory: '4g' } }).stacks, [])
})
