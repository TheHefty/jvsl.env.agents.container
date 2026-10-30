import { test } from 'node:test'
import assert from 'node:assert/strict'

import { HANDOVER_MS, handoverFolder, startupAction } from './handover.ts'

/**
 * Story opening-a-folder-writes-nothing: activation prepares a folder only when
 * Open or Create handed it over, moments ago, by name. Anything else is a
 * folder somebody opened with `code <folder>`, and it is left untouched.
 */
const now = 1_000_000_000_000

test('a fresh handover naming this folder prepares it', () => {
  assert.equal(startupAction({ folder: '/home/me/p', at: now - 5_000 }, '/home/me/p', now), 'prepare')
  assert.equal(startupAction({ folder: '/home/me/p/', at: now }, '/home/me/p', now), 'prepare', 'a trailing slash is the same folder')
})

test('no handover, the plain `code <folder>` case, prepares nothing', () => {
  assert.equal(startupAction(undefined, '/home/me/p', now), 'nothing')
})

test('a handover for another folder prepares nothing', () => {
  assert.equal(startupAction({ folder: '/home/me/other', at: now }, '/home/me/p', now), 'nothing')
})

test('a stale handover prepares nothing, as when the window Open asked for never opened', () => {
  assert.equal(startupAction({ folder: '/home/me/p', at: now - HANDOVER_MS - 1 }, '/home/me/p', now), 'nothing')
})

test('a malformed handover, or a window with no folder, prepares nothing', () => {
  for (const bad of [null, 'x', { folder: 3, at: now }, { folder: '/home/me/p' }, { at: now }]) {
    assert.equal(startupAction(bad, '/home/me/p', now), 'nothing', JSON.stringify(bad))
  }
  assert.equal(startupAction({ folder: '/home/me/p', at: now }, undefined, now), 'nothing')
})

// --- a WSL window prepares what Open handed it (debt ck8, task ck8.1)

test('a WSL window matches the handover by its project path, as a local one does', () => {
  const wsl = { kind: 'wsl', distro: 'archlinux', path: '\\\\wsl.localhost\\archlinux\\home\\x', linux: '/home/x' }
  const folder = handoverFolder(wsl)
  assert.equal(folder, wsl.path)
  assert.equal(startupAction({ folder: wsl.path, at: 1000 }, folder, 2000), 'prepare')
  assert.equal(handoverFolder({ kind: 'host', path: 'c:\\x' }), 'c:\\x')
  assert.equal(handoverFolder({ kind: 'none' }), undefined)
})
