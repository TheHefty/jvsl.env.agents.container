import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatDetected } from './diagnostics.ts'

const facts = {
  cpuCount: 8,
  devicesPresent: ['/dev/fuse'],
  devicesAbsent: ['/dev/kvm'],
}

test('where the extension is running is reported, because the wrong answer is silent', () => {
  // From the remote extension host it would read the container's cpu count as
  // the host's and compute a limit for the wrong machine, with nothing erroring.
  const onHost = formatDetected({ facts, runningOnHost: true })
  const notOnHost = formatDetected({ facts, runningOnHost: false })
  assert.ok(onHost.join('\n') !== notOnHost.join('\n'), 'both cases read identically')
  assert.ok(/not running on the host/i.test(notOnHost.join('\n')), notOnHost.join('\n'))
})

test('devices the host lacks are named rather than omitted', () => {
  const lines = formatDetected({ facts, runningOnHost: true })
  const text = lines.join('\n')
  assert.ok(text.includes('/dev/fuse'), text)
  assert.ok(text.includes('/dev/kvm'), text)
})
