import { test } from 'node:test'
import assert from 'node:assert/strict'

import { dockerArgv, PROBE_IMAGE, whereFor } from './docker.ts'
import { factsFor, parseProbe } from './host.ts'

// --- where docker runs (story docker-and-the-machines-facts-are-asked-of-the-distro)

test('a local project runs docker itself, with its arguments untouched', () => {
  assert.deepEqual(dockerArgv({ kind: 'local' }, ['ps', '--format', '{{.Names}}']), {
    command: 'docker',
    args: ['ps', '--format', '{{.Names}}'],
  })
})

test('a WSL project runs the distro\'s docker through wsl.exe, never through a shell', () => {
  // An array all the way down: a path with spaces, quotes or $( ) is one
  // argument to docker, not something a shell gets to read.
  const nasty = ['image', 'inspect', "my proj'$(rm -rf ~)\"x"]
  assert.deepEqual(dockerArgv({ kind: 'wsl', distro: 'Ubuntu-22.04' }, nasty), {
    command: 'wsl.exe',
    args: ['-d', 'Ubuntu-22.04', '--exec', 'docker', ...nasty],
  })
})

test('the location decides where docker runs', () => {
  assert.deepEqual(whereFor({ kind: 'host', path: '/home/a/p' }), { kind: 'local' })
  assert.deepEqual(whereFor({ kind: 'wsl', distro: 'Ubuntu', path: '/home/a/p', unc: '\\\\wsl.localhost\\Ubuntu\\home\\a\\p' }), {
    kind: 'wsl',
    distro: 'Ubuntu',
  })
})

test('the probe image is pinned by digest, as every fetched dependency is', () => {
  assert.match(PROBE_IMAGE, /^alpine:[0-9.]+@sha256:[0-9a-f]{64}$/)
})

// --- the facts, from where the container will run --------------------------------

test('the probe output names the devices the daemon\'s machine has', () => {
  assert.deepEqual(parseProbe('/dev/fuse\n/dev/kvm\n'), {
    devicesPresent: ['/dev/fuse', '/dev/kvm'],
    devicesAbsent: ['/dev/net/tun'],
  })
  // Anything it did not ask about is ignored rather than passed to --device.
  assert.deepEqual(parseProbe('/dev/fuse\n/dev/sda\n').devicesPresent, ['/dev/fuse'])
})

type Call = string[]
const fakeDocker = (answers: Record<string, string | Error>) => {
  const calls: Call[] = []
  const docker = (args: string[]): Promise<{ stdout: string; stderr: string }> => {
    calls.push(args)
    const a = answers[args[0] ?? ''] ?? new Error('unexpected')
    return a instanceof Error ? Promise.reject(a) : Promise.resolve({ stdout: a, stderr: '' })
  }
  return { docker, calls }
}
const linuxProbe = { cpuCount: () => 16, exists: (d: string) => d === '/dev/fuse', devices: ['/dev/fuse', '/dev/net/tun', '/dev/kvm'] }

test('on native Linux the facts are read from this machine, as before, and docker is not asked', async () => {
  const { docker, calls } = fakeDocker({})
  const f = await factsFor({ kind: 'host', path: '/p' }, docker, 'linux', linuxProbe)
  assert.deepEqual(f.facts, { cpuCount: 16, devicesPresent: ['/dev/fuse'], devicesAbsent: ['/dev/net/tun', '/dev/kvm'] })
  assert.deepEqual(calls, [])
})

test('for a WSL project the facts are what the distro\'s docker sees, not this machine\'s', async () => {
  const { docker, calls } = fakeDocker({ info: '8\n', run: '/dev/fuse\n/dev/net/tun\n' })
  const f = await factsFor({ kind: 'wsl', distro: 'Ubuntu', path: '/p', unc: 'u' }, docker, 'win32', linuxProbe)
  assert.deepEqual(f.facts, { cpuCount: 8, devicesPresent: ['/dev/fuse', '/dev/net/tun'], devicesAbsent: ['/dev/kvm'] })
  const run = calls.find((c) => c[0] === 'run') ?? []
  assert.ok(run.includes('/dev:/host-dev:ro') && run.includes(PROBE_IMAGE), JSON.stringify(run))
})

test('on Windows a local project is asked of docker too: Windows has no /dev', async () => {
  const { docker } = fakeDocker({ info: '12\n', run: '/dev/fuse\n' })
  const f = await factsFor({ kind: 'host', path: 'C:\\p' }, docker, 'win32', linuxProbe)
  assert.equal(f.facts.cpuCount, 12)
  assert.deepEqual(f.facts.devicesPresent, ['/dev/fuse'])
})

test('a probe that fails passes no devices and says so, never a guess', async () => {
  const { docker } = fakeDocker({ info: '8\n', run: new Error('pull access denied: offline') })
  const f = await factsFor({ kind: 'wsl', distro: 'Ubuntu', path: '/p', unc: 'u' }, docker, 'win32', linuxProbe)
  assert.deepEqual(f.facts.devicesPresent, [])
  assert.equal(f.facts.devicesAbsent.length, 3)
  assert.ok(f.notes.some((n) => /devices/.test(n) && /offline/.test(n)), f.notes.join('\n'))
})

test('a core count docker cannot give is refused, not invented', async () => {
  const { docker } = fakeDocker({ info: new Error('Cannot connect to the Docker daemon'), run: '' })
  await assert.rejects(
    factsFor({ kind: 'wsl', distro: 'Ubuntu', path: '/p', unc: 'u' }, docker, 'win32', linuxProbe),
    /Docker daemon/,
  )
})

test('a docker info that answers no number is refused too, not read as NaN cores', async () => {
  const { docker } = fakeDocker({ info: '\n', run: '/dev/fuse\n' })
  await assert.rejects(
    factsFor({ kind: 'wsl', distro: 'Ubuntu', path: '/p', unc: 'u' }, docker, 'win32', linuxProbe),
    /core count/,
  )
})
