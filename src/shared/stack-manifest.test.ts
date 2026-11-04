import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as manifest from './stack-manifest.ts'

test('the manifest has one name, and it is this extension\'s', () => {
  assert.equal(manifest.MANIFEST, '.agent-container.stack.json')
})

test('the legacy name and its adoption are gone (task 4wl.3)', () => {
  // Removed with Migrate on 2026-11-04: no project in the old format remains.
  // A module that exported either again would be reading a file nothing writes.
  assert.deepEqual(Object.keys(manifest).sort(), ['MANIFEST'])
})
