import { test } from 'node:test'
import assert from 'node:assert/strict'

import { waylandWorkaround } from './wayland.ts'

/**
 * Debt chf, found on 2026-10-30: a project on the Windows filesystem did not
 * open through Docker Desktop, because Dev Containers mounted WSLg's Wayland
 * socket from the default WSL distro, which Docker Desktop could not reach.
 * Turning dev.containers.mountWaylandSocket off was enough. The person should
 * never have to know: the extension turns it off, unless they chose otherwise.
 */
const host = { kind: 'host' as const, path: 'c:\\projetos\\x' }
const wsl = { kind: 'wsl' as const, distro: 'archlinux', path: '\\\\wsl.localhost\\archlinux\\home\\x', linux: '/home/x' }
const unset = { key: 'dev.containers.mountWaylandSocket', defaultValue: true }

test('on Windows, a project on the Windows filesystem with the setting left as it came gets it turned off', () => {
  assert.equal(waylandWorkaround({ platform: 'win32', project: host, setting: unset }).action, 'turn-off')
  assert.equal(waylandWorkaround({ platform: 'win32', project: host, setting: undefined }).action, 'turn-off')
})

test('a person who set it to true keeps it, and is told the open will fail through Docker Desktop', () => {
  for (const where of ['globalValue', 'workspaceValue', 'workspaceFolderValue']) {
    const d = waylandWorkaround({ platform: 'win32', project: host, setting: { ...unset, [where]: true } })
    assert.equal(d.action, 'warn', where)
    assert.match(d.action === 'warn' ? d.message : '', /dev\.containers\.mountWaylandSocket/)
  }
})

test('already off, it is left alone and nothing is said', () => {
  assert.equal(waylandWorkaround({ platform: 'win32', project: host, setting: { ...unset, globalValue: false } }).action, 'leave')
})

test('anywhere it is not needed, it is not touched', () => {
  assert.equal(waylandWorkaround({ platform: 'win32', project: wsl, setting: unset }).action, 'leave', "a WSL project: the distro's own Docker")
  assert.equal(waylandWorkaround({ platform: 'linux', project: { kind: 'host', path: '/home/x' }, setting: unset }).action, 'leave')
  assert.equal(waylandWorkaround({ platform: 'darwin', project: { kind: 'host', path: '/Users/x' }, setting: unset }).action, 'leave')
  assert.equal(waylandWorkaround({ platform: 'win32', project: { kind: 'none', reason: 'no folder' }, setting: unset }).action, 'leave')
})
