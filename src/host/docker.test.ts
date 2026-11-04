import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { dockerBounded } from './docker.ts'

// gh-328, debt a-docker-call-that-times-out-keeps-running: the bound raced the
// process against a timer, so a call that timed out rejected and left its
// docker running — once per call, against exactly the daemon that hangs. These
// drive the real dockerBounded with a fake `docker` first on PATH.

function fakeDocker(script: string): { dir: string; pidFile: string } {
  const dir = mkdtempSync(join(tmpdir(), 'fake-docker-'))
  const pidFile = join(dir, 'pid')
  writeFileSync(join(dir, 'docker'), `#!/usr/bin/env bash\necho $$ > '${pidFile}'\n${script}\n`)
  chmodSync(join(dir, 'docker'), 0o755)
  return { dir, pidFile }
}

async function withPath<T>(dir: string, body: () => Promise<T>): Promise<T> {
  const before = process.env['PATH']
  process.env['PATH'] = `${dir}:${before ?? ''}`
  try {
    return await body()
  } finally {
    process.env['PATH'] = before
  }
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test('failure 1: a call that times out ends its process', async () => {
  const { dir, pidFile } = fakeDocker('exec sleep 30')
  await withPath(dir, async () => {
    await assert.rejects(dockerBounded(['info'], 300), /timeout/)
  })
  await settle(200)
  assert.ok(existsSync(pidFile), 'the fake docker ran')
  const pid = Number(readFileSync(pidFile, 'utf8').trim())
  const left = alive(pid)
  if (left) process.kill(pid, 'SIGKILL')
  assert.equal(left, false, `docker (pid ${pid}) was still running after its call timed out`)
})

test('failure 2: the rejection still reads as a timeout to every caller', async () => {
  const { dir } = fakeDocker('exec sleep 30')
  await withPath(dir, async () => {
    await assert.rejects(dockerBounded(['image', 'inspect', 'x'], 200), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(error.message, 'timeout')
      return true
    })
  })
})

test('failure 3: a call that answers in time, or fails on its own, is unchanged', async () => {
  const ok = fakeDocker('echo "{\\"ServerVersion\\":\\"26\\"}"')
  await withPath(ok.dir, async () => {
    const { stdout } = await dockerBounded(['info'], 2000)
    assert.equal(stdout.trim(), '{"ServerVersion":"26"}')
  })
  const failing = fakeDocker('echo "Error: No such image: x" >&2; exit 1')
  await withPath(failing.dir, async () => {
    await assert.rejects(dockerBounded(['image', 'inspect', 'x'], 2000), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.notEqual(error.message, 'timeout')
      assert.match(String((error as { stderr?: string }).stderr ?? error.message), /No such image/)
      return true
    })
  })
})
