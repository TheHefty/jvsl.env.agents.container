import { test } from 'node:test'
import assert from 'node:assert/strict'

import { filesFor, type Exec } from '../host/files.ts'
import { applySwitches, MEMORY_MARKER } from './switches.ts'

/**
 * ai-memory's marker, written or removed from Configure's answers (story d27.1,
 * task d27.1.1). **The switch, never the data**: a no removes .ai-memory.toml
 * and nothing else, and says the store and the tracker's .beads/ are kept.
 */
function recording(present: Set<string>) {
  const calls: string[] = []
  return {
    calls,
    files: {
      exists: (rel: string) => present.has(rel),
      write: (rel: string) => { calls.push(`write ${rel}`); present.add(rel) },
      remove: (rel: string) => { calls.push(`remove ${rel}`); present.delete(rel) },
    },
  }
}

test('a yes writes the marker when it is absent, and only then', () => {
  const r = recording(new Set())
  applySwitches(r.files, { aiMemory: true }, () => {})
  assert.deepEqual(r.calls, [`write ${MEMORY_MARKER}`])
  applySwitches(r.files, { aiMemory: true }, () => {})
  assert.deepEqual(r.calls, [`write ${MEMORY_MARKER}`], 'already there: left as it is')
})

test('a no removes the marker alone, and says the data is kept', () => {
  const r = recording(new Set([MEMORY_MARKER, '.beads/issues.jsonl']))
  const said: string[] = []
  applySwitches(r.files, { aiMemory: false, beads: false }, (l) => said.push(...l))
  assert.deepEqual(r.calls, [`remove ${MEMORY_MARKER}`])
  assert.ok(!r.calls.some((c) => c.includes('.beads')), 'nothing under .beads/ is touched')
  assert.match(said.join('\n'), /memory store .*kept/)
  assert.match(said.join('\n'), /\.beads\/ .*kept/)
})

test('no answer touches nothing', () => {
  const r = recording(new Set([MEMORY_MARKER]))
  applySwitches(r.files, {}, () => {})
  assert.deepEqual(r.calls, [])
})

test('for a WSL project the marker is written and removed through the distro', () => {
  const calls: string[][] = []
  const exec: Exec = (command, args) => {
    calls.push([command, ...args])
    // exists: absent, so the yes writes it; every other call succeeds.
    return { status: args.at(-3)?.includes('[ -e') ? 1 : 0, stdout: '', stderr: '' }
  }
  const files = filesFor({ kind: 'wsl', distro: 'archlinux', path: '\\\\wsl.localhost\\archlinux\\home\\x', linux: '/home/x' }, exec)
  applySwitches(files, { aiMemory: true }, () => {})
  assert.ok(calls.length > 0 && calls.every((c) => c[0] === 'wsl.exe'), JSON.stringify(calls))
  assert.ok(calls.some((c) => c.at(-1) === `/home/x/${MEMORY_MARKER}`))
})
