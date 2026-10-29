import { test } from 'node:test'
import assert from 'node:assert/strict'

import { runMove, startedDue, STUDY_MOVE } from './moves.ts'
import type { Item } from '../board/board-read.ts'
import type { Docker } from '../host/docker.ts'

// --- the view moves the topic, and never silently (story the-view-moves-the-topic-in-the-tracker)

const task = (status: string, labels: string[] = ['study']): Item => ({ id: 'st-1', title: 't', status, type: 'task', labels, blockedBy: [], metadata: { study: 'labels' } })
test('opening a topic starts it exactly when it is still open', () => {
  assert.equal(startedDue(task('open')), true)
  for (const s of ['in_progress', 'closed']) assert.equal(startedDue(task(s)), false, s)
  assert.equal(startedDue(task('in_progress', ['study', 'ready-to-write'])), false)
  assert.equal(startedDue(undefined), false)
})

// docker as the board's lookup sees it: one container labelled with the project.
const fakeDocker = (exec: (args: string[]) => Promise<{ stdout: string; stderr: string }>, running = 'c1\tproj-app\t/p\n') => {
  const calls: string[][] = []
  const docker: Docker = (args) => {
    calls.push(args)
    if (args[0] === 'ps') return Promise.resolve({ stdout: running, stderr: '' })
    return exec(args)
  }
  return { docker, calls }
}
const project = { kind: 'host' as const, path: '/p' }

test('a move runs the plugin script in the project container, as abc, in the workspace', async () => {
  const { docker, calls } = fakeDocker(() => Promise.resolve({ stdout: 'labels: ready to write — st-1\n', stderr: '' }))
  const r = await runMove(project, docker, 'labels', 'ready')
  assert.deepEqual(r, { ok: true, line: 'labels: ready to write — st-1' })
  const exec = calls.find((c) => c[0] === 'exec') ?? []
  assert.deepEqual(exec.slice(0, 7), ['exec', '-u', 'abc', '-e', 'HOME=/config', '-w', '/config/workspace'])
  assert.deepEqual(exec.slice(8), [STUDY_MOVE, 'labels', 'ready'])
})

test('a refused move gives the script its own line, never a bare error', async () => {
  const refused = Object.assign(new Error('Command failed'), { code: 1, stdout: 'study-move: labels was not marked ready. Every item needs an attempt first, and these have none: q-2.\n', stderr: '' })
  const { docker } = fakeDocker(() => Promise.reject(refused))
  const r = await runMove(project, docker, 'labels', 'ready')
  assert.equal(r.ok, false)
  assert.match(r.line, /these have none: q-2/)
})

test('with the container stopped, the move says so instead of failing quietly', async () => {
  const { docker, calls } = fakeDocker(() => Promise.reject(new Error('not reached')), '')
  const r = await runMove(project, docker, 'labels', 'started')
  assert.equal(r.ok, false)
  assert.match(r.line, /container is not running/)
  assert.equal(calls.some((c) => c[0] === 'exec'), false)
})

test('the published link is passed as one argument, whatever it holds', async () => {
  const { docker, calls } = fakeDocker(() => Promise.resolve({ stdout: 'ok\n', stderr: '' }))
  await runMove(project, docker, 'labels', 'published', 'https://blog.example/a post; rm -rf /')
  const exec = calls.find((c) => c[0] === 'exec') ?? []
  assert.equal(exec.at(-1), 'https://blog.example/a post; rm -rf /')
})
