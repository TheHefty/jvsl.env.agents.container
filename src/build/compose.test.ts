import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compose } from './compose.ts'

/**
 * The composer's contract as the extension uses it. Its behaviour — every
 * substitution, ordering and refusal — is held by core/compose-dockerfile.test.sh,
 * which drives it through tools/compose.ts, as it drove the shell script this
 * replaced; and the port was compared byte for byte with that script before it
 * was deleted (61 compositions, every stack and version, refusals included).
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url))

test('core alone composes, with the label last', () => {
  const r = compose({ root: ROOT, stacks: [] })
  assert.ok(r.ok)
  if (r.ok) assert.match(r.dockerfile, /\nLABEL devcontainer\.metadata='\[.*\]'\n$/)
})

test('a refusal is a value with the reason, never an exception the build would surface raw', () => {
  const unknown = compose({ root: ROOT, stacks: ['nosuch'] })
  assert.deepEqual(unknown, { ok: false, message: "compose-dockerfile: unknown stack 'nosuch'." })

  const dir = mkdtempSync(join(tmpdir(), 'compose-'))
  const manifest = join(dir, 'm.json')
  writeFileSync(manifest, '{"packages": ["tree", "x$(id)"]}')
  const bad = compose({ root: ROOT, stacks: [], manifestPath: manifest })
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.match(bad.message, /is not a Debian package name/)
})

test('a manifest that is not there is a project that asked for nothing', () => {
  const r = compose({ root: ROOT, stacks: ['java'], manifestPath: join(tmpdir(), 'no-such-manifest.json') })
  assert.ok(r.ok)
  if (r.ok) assert.ok(r.dockerfile.includes('openjdk-21-jdk'), 'the first version java offers')
})
