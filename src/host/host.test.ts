import { test } from 'node:test'
import assert from 'node:assert/strict'

import { factsFor, hostFacts } from './host.ts'

test('the device nodes the host has are reported apart from the ones it does not', () => {
  // Passing --device for a path that does not exist is a hard failure rather
  // than a no-op, which is why the absent ones have to be known by name and not
  // merely left out.
  const facts = hostFacts({
    cpuCount: () => 8,
    exists: (p) => p === '/dev/fuse',
    devices: ['/dev/fuse', '/dev/net/tun', '/dev/kvm'],
  })
  assert.deepEqual(facts.devicesPresent, ['/dev/fuse'])
  assert.deepEqual(facts.devicesAbsent, ['/dev/net/tun', '/dev/kvm'])
})

test('the host cpu count is reported as the host sees it', () => {
  const facts = hostFacts({ cpuCount: () => 16, exists: () => false, devices: [] })
  assert.equal(facts.cpuCount, 16)
})

test('a host with none of the devices still produces facts', () => {
  const facts = hostFacts({ cpuCount: () => 2, exists: () => false, devices: ['/dev/kvm'] })
  assert.deepEqual(facts.devicesPresent, [])
  assert.deepEqual(facts.devicesAbsent, ['/dev/kvm'])
})

// --- the host's timezone (story the-container-and-the-sandbox-use-the-hosts-timezone)
//
// Read on the host, because the container only knows UTC. A value that is not a
// timezone must not reach TZ: glibc falls back to UTC with no error, so a bad
// value is a container that silently keeps the wrong time.

const probeWith = (timeZone: () => string | undefined) => ({ cpuCount: () => 4, exists: () => false, devices: [], timeZone })

for (const zone of ['America/Sao_Paulo', 'Asia/Kolkata', 'America/Argentina/Buenos_Aires', 'Etc/GMT+3', 'UTC']) {
  test(`the host's timezone ${zone} is kept as it is`, () => {
    assert.equal(hostFacts(probeWith(() => zone)).timeZone, zone)
  })
}

for (const bad of ['', 'undefined', 'Pacific Standard Time', '../etc', 'America/', '/etc/localtime', 'Sao_Paulo']) {
  test(`a value that is not a timezone (${JSON.stringify(bad)}) is not kept`, () => {
    assert.ok(!('timeZone' in hostFacts(probeWith(() => bad))))
  })
}

test('a probe with no timezone, or one that throws, leaves no timezone rather than failing', () => {
  assert.ok(!('timeZone' in hostFacts(probeWith(() => undefined))))
  assert.ok(!('timeZone' in hostFacts(probeWith(() => { throw new Error('no ICU') }))))
  assert.ok(!('timeZone' in hostFacts({ cpuCount: () => 4, exists: () => false, devices: [] })))
})

test('an unreadable timezone is said, naming what was read and that the container keeps UTC', async () => {
  const docker = () => Promise.reject(new Error('not asked on a Linux host'))
  const f = await factsFor({ kind: 'host', path: '/p' }, docker, 'linux', probeWith(() => 'Pacific Standard Time'))
  assert.ok(!('timeZone' in f.facts))
  assert.equal(f.notes.length, 1)
  assert.match(f.notes[0] ?? '', /could not read the host's timezone \(got "Pacific Standard Time"\), so the container keeps UTC/)
})

test('a readable timezone is in the facts wherever docker runs, and says nothing', async () => {
  const docker = (args: string[]) =>
    Promise.resolve({ stdout: args[0] === 'info' ? '8\n' : '/dev/fuse\n', stderr: '' })
  const wsl = await factsFor({ kind: 'wsl', distro: 'Ubuntu', path: 'u', linux: '/p' }, docker, 'win32', probeWith(() => 'America/Sao_Paulo'))
  assert.equal(wsl.facts.timeZone, 'America/Sao_Paulo')
  assert.deepEqual(wsl.notes, [])
})
