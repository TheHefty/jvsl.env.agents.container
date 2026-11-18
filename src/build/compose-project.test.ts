import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { composeForProject } from './build.ts'
import { compose } from './compose.ts'

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
  const r = compose({ root: c.root, stacks: c.stacks, manifestPath: c.manifest })
  assert.ok(r.ok, r.ok ? '' : r.message)
  return { stacks: c.stacks, dockerfile: r.ok ? r.dockerfile : '' }
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

/**
 * gh-327, debt a-malformed-manifest-makes-the-build-throw-instead-of-refusing:
 * composeForProject read a manifest that does not parse as {} and composed core
 * alone, then the build handed the same text to compose(), whose JSON.parse
 * threw a SyntaxError past its own refusals, so Build the Image failed as a
 * generic command error. Driven the way buildInTerminal chains the two.
 */
function buildPath(text: string | null): ReturnType<typeof compose> {
  const root = mkdtempSync(join(tmpdir(), 'malformed-'))
  const plan = composeForProject(EXTENSION, root, text)
  return compose({ root: plan.root, stacks: plan.stacks, manifestPath: plan.manifest, manifestText: text })
}

test('a manifest that is not valid JSON is refused, naming the file, with nothing built', () => {
  let r: ReturnType<typeof compose> | undefined
  assert.doesNotThrow(() => { r = buildPath('{') }, 'a SyntaxError must never escape the build')
  assert.ok(r !== undefined && !r.ok, 'refused rather than composed')
  if (r !== undefined && !r.ok) {
    assert.match(r.message, /\.agent-container\.stack\.json/, 'names the file')
    assert.match(r.message, /is not valid JSON/)
    assert.match(r.message, /nothing was built/i)
  }
})

test('a manifest read from disk that is not valid JSON is refused the same way', () => {
  const dir = mkdtempSync(join(tmpdir(), 'malformed-'))
  const path = join(dir, 'm.json')
  writeFileSync(path, '{"stacks": [')
  let r: ReturnType<typeof compose> | undefined
  assert.doesNotThrow(() => { r = compose({ root: EXTENSION, stacks: [], manifestPath: path }) })
  assert.ok(r !== undefined && !r.ok)
  if (r !== undefined && !r.ok) assert.ok(r.message.includes(path), r.message)
})

test('an absent manifest still builds core alone', () => {
  const r = buildPath(null)
  assert.ok(r.ok, 'core alone composes')
})
