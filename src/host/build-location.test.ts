import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hostChecks } from './checks.ts'
import { distroPath, stopTree, wslpathArgv } from './host-terminal.ts'

// --- story the-build-runs-in-a-terminal-inside-the-distro -------------------------

test('the extension\'s folder is translated by the distro itself, as one argument', () => {
  assert.deepEqual(wslpathArgv('Ubuntu', 'C:\\Users\\João Lima\\.vscode\\extensions\\jvsl-1.5.0'), {
    command: 'wsl.exe',
    args: ['-d', 'Ubuntu', '--exec', 'wslpath', '-u', 'C:\\Users\\João Lima\\.vscode\\extensions\\jvsl-1.5.0'],
  })
})

test('a translated path is used only when it is an absolute Linux path', async () => {
  const ok = await distroPath('Ubuntu', 'C:\\x', () => Promise.resolve({ stdout: '/mnt/c/x\n', stderr: '' }))
  assert.deepEqual(ok, { ok: true, path: '/mnt/c/x' })
  for (const stdout of ['', 'C:\\x\n', 'wslpath: C:\\x: No such file or directory\n']) {
    const bad = await distroPath('Ubuntu', 'C:\\x', () => Promise.resolve({ stdout, stderr: '' }))
    assert.equal(bad.ok, false, stdout)
    assert.ok(!bad.ok && bad.reason.includes('C:\\x') && bad.reason.includes('Ubuntu'))
  }
  const failed = await distroPath('Ubuntu', 'D:\\x', () => Promise.reject(new Error('drive not mounted')))
  assert.ok(!failed.ok && failed.reason.includes('drive not mounted'))
})

test('closing the terminal stops the whole tree: a process group on Linux, taskkill on Windows', () => {
  assert.deepEqual(stopTree(4242, 'linux'), { kind: 'group', pid: 4242 })
  assert.deepEqual(stopTree(4242, 'win32'), { kind: 'spawn', command: 'taskkill', args: ['/pid', '4242', '/T', '/F'] })
})

// --- the host checks, from Windows ------------------------------------------------

const answers = (version: unknown, info: unknown) => (args: string[]) => {
  const a = args[0] === 'version' ? version : info
  return a instanceof Error ? Promise.reject(a) : Promise.resolve({ stdout: String(a), stderr: '' })
}
const enoent = Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' })

test('docker is found by asking it, not by a /bin/sh that Windows does not have', async () => {
  const c = await hostChecks(answers('27.1.0', 'ok'), 'win32', () => Promise.reject(new Error('no /bin/sh')))
  assert.equal(c.docker, 'ok')
  assert.equal(c.manager, null)
})

test('a docker that cannot be started is absent; one in a distro that lacks it too', async () => {
  assert.equal((await hostChecks(answers(enoent, 'x'), 'win32')).docker, 'absent')
  const missingInDistro = new Error('wsl: exec: "docker": executable file not found in $PATH')
  assert.equal((await hostChecks(answers(missingInDistro, 'x'), 'win32')).docker, 'absent')
})

test('a client whose daemon does not answer is unusable, not absent', async () => {
  const c = await hostChecks(answers('27.1.0', new Error('Cannot connect to the Docker daemon')), 'win32')
  assert.equal(c.docker, 'unusable')
})

test('on Linux the package manager is still detected for the install hint', async () => {
  const c = await hostChecks(answers('27.1.0', 'ok'), 'linux', (cmd) => Promise.resolve(cmd === 'apt-get'))
  assert.equal(c.manager, 'apt')
})
