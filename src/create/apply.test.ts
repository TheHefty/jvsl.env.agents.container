import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { filesFor, type Exec } from '../host/files.ts'
import { apply } from './apply.ts'

/**
 * Create's writes, for a project in a WSL distro (debt ck8, task ck8.2). Found
 * on 2026-10-30: Create from a WSL window wrote the scaffold to the Windows
 * disk, under the bare Linux path. Every write now goes through the project's
 * own files, and for a WSL project that is the distro.
 */
const PLAN = [
  { path: '.agent-container.stack.json', contents: '{"stacks":[]}\n' },
  { path: '.devcontainer/devcontainer.json', contents: '{}\n' },
]

test('a WSL project\'s scaffold is written through the distro, each file once, and nothing on this disk', () => {
  // A Linux path that does not exist here: if anything wrote locally, it would.
  const linux = join(mkdtempSync(join(tmpdir(), 'ck8-')), 'not-here', 'x')
  const calls: { args: string[]; input?: string }[] = []
  const exec: Exec = (command, args, input) => { calls.push({ args: [command, ...args], input }); return { status: 0, stdout: '', stderr: '' } }
  const files = filesFor({ kind: 'wsl', distro: 'archlinux', path: `\\\\wsl.localhost\\archlinux${linux.replace(/\//g, '\\')}`, linux }, exec)
  const result = apply(files, PLAN, () => {})
  assert.deepEqual(result, { written: PLAN.map((w) => w.path), failed: [] })
  assert.equal(calls.length, PLAN.length)
  for (const [i, w] of PLAN.entries()) {
    assert.deepEqual(calls[i]!.args.slice(0, 5), ['wsl.exe', '-d', 'archlinux', '--exec', 'sh'])
    assert.equal(calls[i]!.args.at(-1), `${linux}/${w.path}`)
    assert.equal(calls[i]!.input, w.contents)
  }
  assert.equal(existsSync(join(linux, '..')), false, 'nothing was created on this disk')
})

test('a write the distro refuses is reported with its words, and the others still go', () => {
  let n = 0
  const exec: Exec = () => (n++ === 0 ? { status: 1, stdout: '', stderr: 'Permission denied' } : { status: 0, stdout: '', stderr: '' })
  const said: string[] = []
  const result = apply(filesFor({ kind: 'wsl', distro: 'archlinux', path: '\\\\wsl.localhost\\archlinux\\home\\x', linux: '/home/x' }, exec), PLAN, (l) => said.push(...l))
  assert.deepEqual(result, { written: ['.devcontainer/devcontainer.json'], failed: ['.agent-container.stack.json'] })
  assert.match(said.join('\n'), /Permission denied/)
})

test('a project on this machine is written to its folder, as before', () => {
  const root = join(mkdtempSync(join(tmpdir(), 'ck8-host-')), 'new')
  const result = apply(filesFor({ kind: 'host', path: root }), PLAN, () => {})
  assert.deepEqual(result.failed, [])
  for (const w of PLAN) assert.ok(existsSync(join(root, w.path)), w.path)
})
