import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildConfiguration, GENERATED_BY, isOurs, projectNames } from './devcontainer.ts'

const input = {
  projectRoot: '/home/me/code/myrepo',
  homeDir: '/home/me',
  extensionVersion: '0.1.0',
  limits: { memory: '6g', memorySwap: '8g', cpus: 4, usedDefaults: false },
  facts: { cpuCount: 16, devicesPresent: ['/dev/fuse', '/dev/kvm'], devicesAbsent: ['/dev/net/tun'] },
}

test('the names follow the launcher, so both do not have to be configured twice', () => {
  const names = projectNames('/home/me/code/myrepo')
  assert.deepEqual(names, {
    repo: 'myrepo',
    image: 'myrepo-dev',
    volume: 'myrepo-code-server-data',
    launcherContainer: 'myrepo-app',
  })
})

test('the image is referenced by name and never built', () => {
  const config = buildConfiguration(input)
  assert.equal(config.image, 'myrepo-dev')
  assert.ok(!('build' in config), 'image-declared metadata is only resolved for a prebuilt image')
  assert.ok(!('dockerFile' in config))
})

test('remoteUser is not written, because the image declares it', () => {
  // Both declaring it means the configuration wins and the image can lie with
  // nothing erroring. That source is image-declares-its-user's decision.
  const config = buildConfiguration(input)
  assert.ok(!('remoteUser' in config), JSON.stringify(config))
  assert.ok(!('containerUser' in config))
})

test('what the specification expresses natively is not hidden in runArgs', () => {
  const config = buildConfiguration(input)
  assert.deepEqual(config.capAdd, ['SYS_ADMIN'])
  assert.deepEqual(config.securityOpt, ['seccomp=unconfined', 'systempaths=unconfined'])
  assert.deepEqual(config.containerEnv, { PUID: '1000', PGID: '1000', PASSWORD: '' })
  assert.equal(config.workspaceFolder, '/config/workspace')
  assert.ok(config.workspaceMount.includes('/home/me/code/myrepo'))
  assert.ok(config.workspaceMount.includes('target=/config/workspace'))
  const flags = config.runArgs.join(' ')
  for (const native of ['--cap-add', '--security-opt', '-e', '--mount', '-v']) {
    assert.ok(!flags.includes(native), `${native} should not be in runArgs: ${flags}`)
  }
})

test('the three mounts the launcher has are reproduced', () => {
  const config = buildConfiguration(input)
  const mounts = config.mounts.join('\n')
  assert.ok(mounts.includes('source=myrepo-code-server-data'), mounts)
  assert.ok(mounts.includes('target=/config,'), mounts)
  assert.ok(mounts.includes('source=/home/me/.claude'), mounts)
  assert.ok(mounts.includes('target=/config/.claude'), mounts)
})

test('memory, swap and cpuset go to runArgs, which has nowhere else to go', () => {
  const config = buildConfiguration(input)
  const args = config.runArgs
  assert.deepEqual(args.slice(0, 6), [
    '--memory', '6g',
    '--memory-swap', '8g',
    '--cpuset-cpus', '0-3',
  ])
})

test('the cpuset falls back to half the host when the manifest is silent', () => {
  const config = buildConfiguration({ ...input, limits: { ...input.limits, cpus: undefined } })
  assert.ok(config.runArgs.join(' ').includes('--cpuset-cpus 0-7'), config.runArgs.join(' '))
})

test('only devices the host has are passed through', () => {
  const config = buildConfiguration(input)
  const args = config.runArgs.join(' ')
  assert.ok(args.includes('--device /dev/fuse'), args)
  assert.ok(args.includes('--device /dev/kvm'), args)
  // A --device for a path that does not exist is a hard failure, not a no-op.
  assert.ok(!args.includes('/dev/net/tun'), args)
})

test('a host with no devices still produces a usable configuration', () => {
  const config = buildConfiguration({
    ...input,
    facts: { cpuCount: 2, devicesPresent: [], devicesAbsent: ['/dev/kvm'] },
  })
  assert.ok(!config.runArgs.includes('--device'))
  assert.equal(config.image, 'myrepo-dev')
})

test('the port is never published', () => {
  const config = buildConfiguration(input)
  assert.ok(!('appPort' in config), 'code-server has no authentication; publishing is opt-in only')
  assert.ok(!('forwardPorts' in config))
  assert.ok(!config.runArgs.includes('-p'))
})

test('the marker says which version wrote the file', () => {
  const config = buildConfiguration(input)
  assert.deepEqual(config[GENERATED_BY], { extension: '0.1.0' })
})

test('the marker carries nothing that changes between opens', () => {
  // THE failure this test exists for: the tooling identifies a container by a
  // hash of the configuration, so a file that differs on every open recreates
  // the container on every open — killing whatever was running inside it,
  // unasked, every time. A timestamp is enough to cause it.
  const marker = buildConfiguration(input)[GENERATED_BY] as Record<string, unknown>
  assert.deepEqual(Object.keys(marker), ['extension'])
})

test('two generations from the same inputs are byte-identical', () => {
  const a = JSON.stringify(buildConfiguration(input), null, 2)
  const b = JSON.stringify(buildConfiguration(input), null, 2)
  assert.equal(a, b)
})

test('a file we wrote is recognised, and anything else is not', () => {
  const ours = JSON.stringify(buildConfiguration(input))
  assert.equal(isOurs(ours), true)
  assert.equal(isOurs('{"image":"myrepo-dev"}'), false, 'someone else wrote this')
  assert.equal(isOurs('{'), false, 'unparseable is not ours')
  assert.equal(isOurs(''), false)
})
