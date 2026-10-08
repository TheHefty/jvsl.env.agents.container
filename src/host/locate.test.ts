import { test } from 'node:test'
import assert from 'node:assert/strict'

import { containerFor, hostPathFromAuthority } from './locate.ts'

const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex')

test('a remote authority whose payload is the host path decodes to it', () => {
  assert.equal(hostPathFromAuthority(`dev-container+${hex('/home/jv/Projetos/demo')}`), '/home/jv/Projetos/demo')
})

test('a remote authority whose payload is JSON decodes to its hostPath', () => {
  const payload = JSON.stringify({ hostPath: '/home/jv/Projetos/demo', configFile: { path: '/x', scheme: 'file' } })
  assert.equal(hostPathFromAuthority(`dev-container+${hex(payload)}`), '/home/jv/Projetos/demo')
})

test('a dev container reached over another remote still decodes', () => {
  // The authority of a nested remote carries the outer one after an `@`.
  assert.equal(hostPathFromAuthority(`dev-container+${hex('/srv/demo')}@ssh-remote+box`), '/srv/demo')
})

test('anything else decodes to nothing, rather than to a guess', () => {
  assert.equal(hostPathFromAuthority('ssh-remote+box'), undefined)
  assert.equal(hostPathFromAuthority('dev-container+zz'), undefined)
  assert.equal(hostPathFromAuthority(`dev-container+${hex('{"configFile":1}')}`), undefined)
  assert.equal(hostPathFromAuthority(`dev-container+${hex('relative/path')}`), undefined)
})

// --- choosing the container -----------------------------------------------

const rows = [
  { id: 'aaa', name: 'demo_devcontainer', localFolder: '/home/jv/Projetos/demo' },
  { id: 'bbb', name: 'other_devcontainer', localFolder: '/home/jv/Projetos/other' },
]

test('the one container labelled with the project is chosen', () => {
  assert.deepEqual(containerFor('/home/jv/Projetos/demo', rows), { kind: 'one', id: 'aaa' })
})

test('a trailing slash on either side still matches', () => {
  assert.deepEqual(containerFor('/home/jv/Projetos/demo/', rows), { kind: 'one', id: 'aaa' })
  assert.deepEqual(
    containerFor('/home/jv/Projetos/demo', [{ id: 'c', name: 'n', localFolder: '/home/jv/Projetos/demo/' }]),
    { kind: 'one', id: 'c' },
  )
})

test('no running container for the project reads as stopped', () => {
  assert.deepEqual(containerFor('/home/jv/Projetos/none', rows), { kind: 'none' })
})

test('a prefix of another project is not that project', () => {
  // /home/jv/Projetos/demo must not match /home/jv/Projetos/demo-two, or the
  // board shows another project's work.
  const near = [{ id: 'x', name: 'n', localFolder: '/home/jv/Projetos/demo-two' }]
  assert.deepEqual(containerFor('/home/jv/Projetos/demo', near), { kind: 'none' })
})

test('two containers for one project are refused by name, never guessed between', () => {
  const twice = [...rows, { id: 'ccc', name: 'demo_again', localFolder: '/home/jv/Projetos/demo' }]
  assert.deepEqual(containerFor('/home/jv/Projetos/demo', twice), {
    kind: 'many',
    names: ['demo_devcontainer', 'demo_again'],
  })
})

// --- every command finds the project on the host (debt: the-panel-reads-the-containers-path)

import { projectOnHost } from './locate.ts'

test('a local window\'s project is its folder', () => {
  assert.deepEqual(projectOnHost({ remoteName: undefined, folder: { fsPath: '/home/jv/demo', authority: '' } }),
    { kind: 'host', path: '/home/jv/demo' })
})

test('a window connected to a dev container finds the project through the authority, never /config/workspace', () => {
  const r = projectOnHost({
    remoteName: 'dev-container',
    folder: { fsPath: '/config/workspace', authority: `dev-container+${hex('/home/jv/demo')}` },
  })
  assert.deepEqual(r, { kind: 'host', path: '/home/jv/demo' })
})

test('an undecodable dev container authority is none, with the reason, never the container path', () => {
  const r = projectOnHost({ remoteName: 'dev-container', folder: { fsPath: '/config/workspace', authority: 'dev-container+zz' } })
  assert.equal(r.kind, 'none')
  assert.ok(r.kind === 'none' && r.reason.includes('dev-container+zz'))
})

test('another kind of remote is none: its files are not on this machine', () => {
  for (const remoteName of ['ssh-remote', 'wsl']) {
    const r = projectOnHost({ remoteName, folder: { fsPath: '/home/u/p', authority: `${remoteName}+box` } })
    assert.equal(r.kind, 'none', remoteName)
  }
})

test('no folder is none', () => {
  assert.equal(projectOnHost({ remoteName: undefined, folder: undefined }).kind, 'none')
})
