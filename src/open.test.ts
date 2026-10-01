import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decideOpen, type OpenContext } from './open.ts'
import { GENERATED_BY } from './devcontainer.ts'

const base: OpenContext = {
  projectRoot: '/home/me/code/myrepo',
  homeDir: '/home/me',
  extensionVersion: '0.1.0',
  facts: { cpuCount: 8, devicesPresent: ['/dev/fuse'], devicesAbsent: ['/dev/kvm'] },
  manifest: '{"limits":{"memory":"6g"}}',
  existingConfig: null,
  runningContainers: [],
  reopenCommandAvailable: true,
  gitignore: '.devcontainer/devcontainer.json\n',
}

const refusal = (c: Partial<OpenContext>): string => {
  const d = decideOpen({ ...base, ...c })
  assert.equal(d.action, 'refuse', `expected a refusal, got ${d.action}`)
  return d.action === 'refuse' ? d.cause : ''
}

test('the host directories the mounts need are named for the caller to create', () => {
  // `mounts` uses --mount semantics, which FAILS when the bind source does not
  // exist — unlike the `-v` the launcher used, which created it. A host that
  // has never run an agent has no ~/.claude, and without this the open dies on
  // a mount error naming a path and no cause.
  const d = decideOpen(base)
  assert.equal(d.action, 'open')
  if (d.action === 'open') {
    assert.deepEqual(d.ensureHostDirs, ['/home/me/.claude'])
  }
})

test('a refusal asks for no directories, because nothing is being opened', () => {
  const d = decideOpen({ ...base, reopenCommandAvailable: false })
  assert.equal(d.action, 'refuse')
})

test('a project with nothing in the way opens', () => {
  const d = decideOpen(base)
  assert.equal(d.action, 'open')
  if (d.action === 'open') assert.equal(d.configuration.image, 'myrepo-dev')
})

test('a configuration somebody else wrote is refused, not overwritten', () => {
  // The only failure here that destroys something: the file is gitignored, so
  // there is no history to recover their work from.
  const cause = refusal({ existingConfig: '{"image":"something-else"}' })
  assert.match(cause, /devcontainer\.json/)
  assert.match(cause, /not written by/i)
})

test('a configuration we wrote before is replaced without comment', () => {
  const ours = JSON.stringify({ [GENERATED_BY]: { extension: '0.0.9' } })
  const d = decideOpen({ ...base, existingConfig: ours })
  assert.equal(d.action, 'open')
})

test('an unparseable configuration on disk is treated as somebody else\'s', () => {
  // It might be ours and corrupted, or theirs and hand-written. Guessing wrong
  // in one direction loses work; in the other it costs one message.
  assert.match(refusal({ existingConfig: '{ broken' }), /not written by/i)
})

test('a running launcher container is refused, naming it and how to stop it', () => {
  // Both would mount the same /config volume: two nested Docker daemons and
  // two ai-memory servers over one store, which is corruption no rebuild
  // undoes.
  const cause = refusal({ runningContainers: ['something-else', 'myrepo-app'] })
  assert.match(cause, /myrepo-app/)
  assert.match(cause, /docker stop myrepo-app/)
  assert.match(cause, /same.*volume|\/config/i)
})

test('another project\'s container running is not this project\'s problem', () => {
  const d = decideOpen({ ...base, runningContainers: ['otherrepo-app'] })
  assert.equal(d.action, 'open')
})

test('a missing reopen command is refused before anything is written', () => {
  // Otherwise accepting the offer writes a file and then nothing happens, with
  // no error — the extension looks broken in a way that points nowhere.
  const cause = refusal({ reopenCommandAvailable: false })
  assert.match(cause, /remote-containers\.reopenInContainer/)
  assert.match(cause, /Dev Containers/i)
})

test('the command is checked before the file is judged', () => {
  // With both wrong, the one that stops anything from working is reported.
  const cause = refusal({ reopenCommandAvailable: false, existingConfig: '{"a":1}' })
  assert.match(cause, /reopenInContainer/)
})

test('a running launcher outranks a foreign configuration', () => {
  // Data first: the volume hazard is the one that cannot be undone.
  const cause = refusal({ runningContainers: ['myrepo-app'], existingConfig: '{"a":1}' })
  assert.match(cause, /myrepo-app/)
})

test('an unreadable manifest opens with defaults and says so', () => {
  const d = decideOpen({ ...base, manifest: '{"limits":' })
  assert.equal(d.action, 'open')
  if (d.action === 'open') {
    assert.ok(d.notes.some((n) => /manifest/i.test(n) && /default/i.test(n)), d.notes.join('\n'))
    assert.equal(d.configuration.runArgs[1], '6g')
  }
})

test('a missing manifest is not a problem worth mentioning', () => {
  // Activation keys off that file, so in practice it is there; and a project
  // that never declared limits is the normal case, not a fault.
  const d = decideOpen({ ...base, manifest: null })
  assert.equal(d.action, 'open')
  if (d.action === 'open') {
    assert.deepEqual(d.notes.filter((n) => /manifest/i.test(n)), [])
  }
})

test('a gitignore missing the generated file is mentioned, not fixed', () => {
  const d = decideOpen({ ...base, gitignore: 'node_modules/\n' })
  assert.equal(d.action, 'open')
  if (d.action === 'open') {
    assert.ok(d.notes.some((n) => /gitignore/i.test(n)), d.notes.join('\n'))
  }
})

test('a gitignore that covers the whole directory counts', () => {
  for (const line of ['.devcontainer/\n', '.devcontainer/devcontainer.json\n', '/.devcontainer\n']) {
    const d = decideOpen({ ...base, gitignore: line })
    assert.equal(d.action, 'open')
    if (d.action === 'open') {
      assert.deepEqual(d.notes.filter((n) => /gitignore/i.test(n)), [], line)
    }
  }
})

test('no gitignore at all is mentioned too', () => {
  const d = decideOpen({ ...base, gitignore: null })
  assert.equal(d.action, 'open')
  if (d.action === 'open') assert.ok(d.notes.some((n) => /gitignore/i.test(n)))
})
