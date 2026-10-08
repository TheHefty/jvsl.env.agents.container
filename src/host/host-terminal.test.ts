import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hostProcessTerminal } from './host-terminal.ts'
import { shippedSources } from '../test-support/sources.ts'

/**
 * Found on 2026-10-07, from a fresh clone of fahrenheit404: the migration's
 * second step, run where the command itself sends the operator (a window
 * connected to the rebuilt container), failed with "Path to shell executable
 * "docker" does not exist". `createTerminal({ shellPath })` launches on the
 * window's remote side, inside the container, while this extension and the
 * docker it drives are on the host. A terminal backed by a process this
 * extension spawns runs where the extension runs, in either kind of window.
 *
 * The connected window itself cannot be driven here; these drive a real
 * process through the terminal, and the guard below keeps every terminal off
 * shellPath.
 */

function drive(command: string, args: string[]) {
  const t = hostProcessTerminal(command, args)
  let text = ''
  let closedWith: number | void | 'open' = 'open'
  const closed = new Promise<number | void>((resolve) => t.onDidClose!((c) => { closedWith = c; resolve(c) }))
  t.onDidWrite((s) => { text += s })
  t.open(undefined)
  return { t, closed, exited: t.exited, text: () => text, state: () => closedWith }
}

test('what the process prints reaches the terminal, with the line endings a terminal needs', async () => {
  const d = drive('sh', ['-c', 'echo one; echo two >&2'])
  await d.exited
  assert.match(d.text(), /one\r\n/)
  assert.match(d.text(), /two\r\n/)
  assert.doesNotMatch(d.text(), /[^\r]\n/, 'a bare \\n would stair-step the output')
})

test('the terminal stays open after its process ends, saying how it ended, until a key (debt 1r9)', async () => {
  // kotodori's planning step refused and exited 1 in under a second; the
  // terminal closed with it and the editor said it had failed to launch.
  const d = drive('sh', ['-c', 'echo "30 line(s) read the folders, so nothing was written"; exit 1'])
  assert.equal(await d.exited, 1)
  await new Promise((r) => setTimeout(r, 50))
  assert.equal(d.state(), 'open', 'still on screen after the process ended')
  assert.match(d.text(), /nothing was written/)
  assert.match(d.text(), /exit 1.*press any key to close/i)
  d.t.handleInput!('x')
  assert.equal(await d.closed, 1, 'a key closes it, with the code')
})

test('the process end is a promise a build reads its outcome from', async () => {
  assert.equal(await drive('sh', ['-c', 'exit 0']).exited, 0)
  assert.equal(await drive('sh', ['-c', 'exit 3']).exited, 3)
})

test('a process killed by a signal ends with 128 plus the signal, as a shell reports it', async () => {
  assert.equal(await drive('sh', ['-c', 'kill -TERM $$']).exited, 143)
})

test('a command that is not there says so in the terminal, instead of a launch error', async () => {
  const d = drive('no-such-command-anywhere', [])
  assert.equal(await d.exited, 127)
  assert.match(d.text(), /no-such-command-anywhere.*not found on this host's PATH/)
})

test('closing the terminal while the process runs stops it, and its end reads as no code: cancelled', async () => {
  const d = drive('sh', ['-c', 'sleep 30'])
  const started = Date.now()
  setTimeout(() => d.t.close(), 100)
  assert.equal(await d.exited, undefined)
  assert.ok(Date.now() - started < 5000)
})

test('no terminal is created on the remote side: nothing passes shellPath to createTerminal', () => {
  const sources = shippedSources()
  assert.ok(sources.some((s) => s.path.endsWith('extension.ts')), 'the scan reaches the entry point')
  for (const { path: f, text: src } of sources) {
    for (const m of src.matchAll(/createTerminal\(\{[\s\S]*?\}\)/g)) {
      assert.doesNotMatch(m[0], /^\s*shellPath\s*[,:}]/m, `${f}: ${m[0].slice(0, 120)}`)
    }
  }
})
