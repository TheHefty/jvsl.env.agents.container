import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { SUPERSEDED_EXTENSION, olderCopyNotice } from './older-copy.ts'

const CURRENT = 'thehefty.jvsl-env-agents-container'

test('nothing is said when the older copy is not installed', () => {
  // Most hosts. An extension that says something on every start is one people
  // learn to ignore, including when it finally matters.
  assert.equal(olderCopyNotice([CURRENT]), undefined)
  assert.equal(olderCopyNotice([]), undefined)
})

test('it is said when the older copy is installed', () => {
  const notice = olderCopyNotice([CURRENT, SUPERSEDED_EXTENSION, 'ms-vscode-remote.remote-containers'])
  assert.ok(notice)
  // It has to name what to remove, or it is an observation rather than
  // something a person can act on.
  assert.match(notice, new RegExp(SUPERSEDED_EXTENSION.replace(/\./g, '\\.')))
})

test('extension ids are compared without regard to case', () => {
  // The editor treats them case-insensitively, so a notice that missed because
  // of capitalisation would be a silence nobody could explain.
  assert.ok(olderCopyNotice([SUPERSEDED_EXTENSION.toUpperCase()]))
})

test('the id it names is never this extension itself', () => {
  // The second failure scenario: if the two ever converged, the notice would
  // tell somebody to uninstall the thing showing it — authoritative and
  // actively harmful. Asserted against the manifest rather than against the
  // literal above, so the two cannot drift.
  const pkg: { name?: unknown; publisher?: unknown } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  )
  const own = `${String(pkg.publisher)}.${String(pkg.name)}`
  assert.equal(own, CURRENT)
  assert.notEqual(SUPERSEDED_EXTENSION, own)
  // And the notice must never fire on a host that has only the current one.
  assert.equal(olderCopyNotice([own]), undefined)
})
