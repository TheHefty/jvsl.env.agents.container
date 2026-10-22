import { test } from 'node:test'
import assert from 'node:assert/strict'

import { homeArgv, homeFor } from './home.ts'

// story the-agents-credentials-bound-into-the-container-are-the-distros

test('the distro\'s home is read with a fixed command, nothing of the project interpolated', () => {
  assert.deepEqual(homeArgv('Ubuntu'), {
    command: 'wsl.exe',
    args: ['-d', 'Ubuntu', '--exec', 'sh', '-c', 'printf %s "$HOME"'],
  })
})

test('a local project binds this machine\'s home, and creates it there', async () => {
  const r = await homeFor({ kind: 'host', path: '/p' }, () => Promise.reject(new Error('not asked')), '/home/me')
  assert.deepEqual(r, { ok: true, home: { mount: '/home/me', local: '/home/me' } })
})

test('a WSL project binds the distro user\'s home, and reaches it from here through UNC', async () => {
  const r = await homeFor(
    { kind: 'wsl', distro: 'Ubuntu', path: '\\\\wsl.localhost\\Ubuntu\\home\\jv\\p', linux: '/home/jv/p' },
    () => Promise.resolve({ stdout: '/home/jv', stderr: '' }),
    'C:\\Users\\jv',
  )
  assert.deepEqual(r, { ok: true, home: { mount: '/home/jv', local: '\\\\wsl.localhost\\Ubuntu\\home\\jv' } })
})

test('a home the distro does not give is refused, naming the distro, never the Windows home', async () => {
  const p = { kind: 'wsl', distro: 'Ubuntu', path: 'u', linux: '/p' } as const
  for (const runner of [
    () => Promise.resolve({ stdout: '', stderr: '' }),
    () => Promise.resolve({ stdout: 'C:\\Users\\jv', stderr: '' }),
    () => Promise.reject(new Error('the distro did not start')),
  ]) {
    const r = await homeFor(p, runner, 'C:\\Users\\jv')
    assert.equal(r.ok, false)
    assert.ok(!r.ok && r.reason.includes('Ubuntu'))
  }
})
