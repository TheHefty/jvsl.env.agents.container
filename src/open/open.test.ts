import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decideOpen, type OpenContext } from './open.ts'
import { GENERATED_BY } from '../build/devcontainer.ts'

const base: OpenContext = {
  projectRoot: '/home/me/code/myrepo',
  homeDir: '/home/me',
  extensionVersion: '0.1.0',
  facts: { cpuCount: 8, devicesPresent: ['/dev/fuse'], devicesAbsent: ['/dev/kvm'] },
  manifest: '{"limits":{"memory":"6g"}}',
  existingConfig: null,
  runningContainers: [],
  reopenCommandAvailable: true,
  image: 'present' as const,
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

test('but the missing reopen command still comes first', () => {
  // Without the handover nothing works at all, and the version is beside the
  // point.
  const cause = refusal({ reopenCommandAvailable: false })
  assert.match(cause, /Dev Containers/)
})

test('a project with no .code-server/ opens', () => {
  // The contradiction this task exists for. The extension composes from what it
  // carries and builds its own image, and until this it then refused to open
  // the project because a submodule it no longer reads was absent.
  const decision = decideOpen({ ...base })
  assert.notEqual(decision.action, 'refuse')
})

test('the decision has no field a submodule could fill', () => {
  // Scenario 4 of this story — "a project with the old submodule still opens" —
  // and the honest form of it. `decideOpen` is a pure function over its context,
  // so the claim is not that varying a submodule changes nothing: it is that
  // **there is nothing to vary.** A test that passed a submodule flag and
  // asserted the decision was identical would be asserting its own fixture.
  //
  // scripts/nothing-reads-the-submodule.test.sh holds the other half, that
  // nothing populates such a field in the first place. Together they are the
  // claim; neither alone is.
  const keys = Object.keys(base).join(' ')
  assert.ok(!/template|submodule|codeServer/i.test(keys), keys)
})

test('an absent image decides to build it, naming it', () => {
  // FR-89. Nothing in this extension noticed a missing image before: what a
  // project got was the Dev Containers extension failing on its own, with a
  // message about a missing image rather than about what to do.
  const d = decideOpen({ ...base, image: 'absent' })
  assert.equal(d.action, 'build')
  assert.match(d.cause ?? '', /myrepo-dev/)
})

test('a present image opens as before', () => {
  const d = decideOpen({ ...base, image: 'present' })
  assert.equal(d.action, 'open')
})

test('an image it cannot ask about is refused, not built', () => {
  // `docker image inspect` fails when the daemon is unreachable as well as
  // when the image is missing, and FR-24 already refuses an unreachable
  // daemon. Confusing the two turns a host problem into a seven-minute build
  // nobody asked for, which then fails for a third reason.
  const d = decideOpen({ ...base, image: 'unknown' })
  assert.equal(d.action, 'refuse')
  assert.match(d.cause ?? '', /daemon|docker/i)
  assert.doesNotMatch(d.cause ?? '', /build/i)
})

test('a refusal comes before a build, because building would not help', () => {
  // A hand-written configuration is refused whatever the image is: there is no
  // point spending seven minutes to then decline to overwrite somebody's file.
  const d = decideOpen({ ...base, image: 'absent', existingConfig: '{"name":"theirs"}' })
  assert.equal(d.action, 'refuse')
})

// --- the open flow inside the container (debt: the-panel-reads-the-containers-path)

import { prepareHere } from './open.ts'

test('a window already connected to the project\'s container has nothing to prepare', () => {
  // Observed on 2026-10-07: on every connection the open flow tried to write
  // .devcontainer/ at the container's path on the host, and only EACCES
  // stopped it.
  const r = prepareHere('dev-container')
  assert.equal(r.act, false)
  assert.ok(!r.act && r.why.includes('already inside'))
})

test('a local window prepares, as before', () => {
  assert.deepEqual(prepareHere(undefined), { act: true })
})

test('another remote does not prepare either: the project is not on this machine', () => {
  assert.equal(prepareHere('ssh-remote').act, false)
})
