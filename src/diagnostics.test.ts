import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatDetected } from './diagnostics.ts'

const facts = {
  cpuCount: 8,
  devicesPresent: ['/dev/fuse'],
  devicesAbsent: ['/dev/kvm'],
}

test('the report names the template version it read', () => {
  const lines = formatDetected({ templateVersion: '2.2.0', templateMinVersion: '2.2.0', facts, runningOnHost: true })
  assert.ok(lines.some((l) => l.includes('2.2.0')), lines.join('\n'))
})

test('a template it could not read is said to be unreadable, not called old', () => {
  const lines = formatDetected({ templateVersion: null, templateMinVersion: '2.2.0', facts, runningOnHost: true })
  const text = lines.join('\n')
  assert.ok(/could not be read|not initiali/i.test(text), text)
  assert.ok(!/too old/i.test(text), 'an unreadable version must not be reported as an old one')
})

test('where the extension is running is reported, because the wrong answer is silent', () => {
  // From the remote extension host it would read the container's cpu count as
  // the host's and compute a limit for the wrong machine, with nothing erroring.
  const onHost = formatDetected({ templateVersion: '2.2.0', templateMinVersion: '2.2.0', facts, runningOnHost: true })
  const notOnHost = formatDetected({ templateVersion: '2.2.0', templateMinVersion: '2.2.0', facts, runningOnHost: false })
  assert.ok(onHost.join('\n') !== notOnHost.join('\n'), 'both cases read identically')
  assert.ok(/not running on the host/i.test(notOnHost.join('\n')), notOnHost.join('\n'))
})

test('devices the host lacks are named rather than omitted', () => {
  const lines = formatDetected({ templateVersion: '2.2.0', templateMinVersion: '2.2.0', facts, runningOnHost: true })
  const text = lines.join('\n')
  assert.ok(text.includes('/dev/fuse'), text)
  assert.ok(text.includes('/dev/kvm'), text)
})
