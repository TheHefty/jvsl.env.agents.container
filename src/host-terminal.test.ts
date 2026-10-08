import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { hostProcessTerminal } from './host-terminal.ts'

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
  const closed = new Promise<number | void>((resolve) => t.onDidClose!(resolve))
  t.onDidWrite((s) => { text += s })
  t.open(undefined)
  return { t, closed, text: () => text }
}

test('what the process prints reaches the terminal, with the line endings a terminal needs', async () => {
  const d = drive('sh', ['-c', 'echo one; echo two >&2'])
  await d.closed
  assert.match(d.text(), /one\r\n/)
  assert.match(d.text(), /two\r\n/)
  assert.doesNotMatch(d.text(), /[^\r]\n/, 'a bare \\n would stair-step the output')
})

test('the exit code closes the terminal, so a build still reads its outcome', async () => {
  assert.equal(await drive('sh', ['-c', 'exit 0']).closed, 0)
  assert.equal(await drive('sh', ['-c', 'exit 3']).closed, 3)
})

test('a process killed by a signal closes with 128 plus the signal, as a shell reports it', async () => {
  assert.equal(await drive('sh', ['-c', 'kill -TERM $$']).closed, 143)
})

test('a command that is not there says so in the terminal, instead of a launch error', async () => {
  const d = drive('no-such-command-anywhere', [])
  assert.equal(await d.closed, 127)
  assert.match(d.text(), /no-such-command-anywhere.*not found on this host's PATH/)
})

test('closing the terminal stops the process', async () => {
  const d = drive('sh', ['-c', 'sleep 30'])
  const started = Date.now()
  setTimeout(() => d.t.close(), 100)
  await d.closed
  assert.ok(Date.now() - started < 5000)
})

test('no terminal is created on the remote side: nothing passes shellPath to createTerminal', () => {
  const dir = new URL('.', import.meta.url).pathname
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
    const src = readFileSync(dir + f, 'utf8')
    for (const m of src.matchAll(/createTerminal\(\{[\s\S]*?\}\)/g)) {
      assert.doesNotMatch(m[0], /^\s*shellPath\s*[,:}]/m, `${f}: ${m[0].slice(0, 120)}`)
    }
  }
})
