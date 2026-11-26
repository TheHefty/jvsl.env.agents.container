import { test } from 'node:test'
import assert from 'node:assert/strict'

import { BRAINSTORM, BRAINSTORM_IMAGE, BRAINSTORM_VOLUME, brainstormConfiguration, isBrainstorm, planBrainstorm } from './brainstorm.ts'
import { CONFIG_PATH, serialise } from '../open/open.ts'
import { MEMORY_MARKER } from '../configure/switches.ts'
import { buildConfiguration, isOurs } from '../build/devcontainer.ts'
import { readLimits } from '../build/limits.ts'
import { startupAction } from '../open/handover.ts'

// --- the Brainstorm command opens the ideation container (story 5kd.2,
// gh-364; task the-brainstorm-command-opens-the-ideation-container) ---------
//
// One container per developer and machine, from core alone, on the ideas
// folder, under the ideation rules, with ai-memory on, kept between days. The
// failures guarded: a second run that recreates the container (a configuration
// that moves between runs); a name shared with a project, so a project's
// volume or image is taken; a configuration in the ideas folder that is not
// ours overwritten.

const IDEAS = '/home/dev/.claude/agent-container/ideas'
const input = {
  ideasDir: IDEAS,
  homeDir: '/home/dev',
  extensionVersion: '1.2.3',
  limits: readLimits('{}', 8).limits,
  facts: { cpuCount: 8, devicesPresent: ['/dev/fuse'], devicesAbsent: ['/dev/kvm'], timeZone: 'America/Sao_Paulo' },
}

test('the image, the volume and the container have fixed names of their own', () => {
  const c = brainstormConfiguration(input)
  assert.equal(c.name, BRAINSTORM)
  assert.equal(c.image, BRAINSTORM_IMAGE)
  assert.equal(BRAINSTORM_IMAGE, 'agent-container-brainstorm-dev')
  assert.ok(c.mounts.includes(`source=${BRAINSTORM_VOLUME},target=/config,type=volume`), c.mounts.join('\n'))
  assert.deepEqual(c.runArgs.slice(-2), ['--name', BRAINSTORM])
})

test('no name a project could have: a folder called ideas does not get the ideas-dev image', () => {
  const project = buildConfiguration({ ...input, projectRoot: IDEAS })
  const c = brainstormConfiguration(input)
  assert.notEqual(c.image, project.image)
  assert.ok(!c.mounts.some((m) => m.startsWith(`source=${project.mounts[0]?.split(',')[0]?.slice('source='.length)},`)))
})

test('the ideas folder is the workspace, and the ideation mode is set', () => {
  const c = brainstormConfiguration(input)
  assert.equal(c.workspaceMount, `source=${IDEAS},target=/config/workspace,type=bind`)
  assert.equal(c.workspaceFolder, '/config/workspace')
  assert.equal(c.containerEnv['AGENT_CONTAINER_MODE'], 'ideation')
})

test('the Brainstorm container keeps the ideas folder writable', () => {
  // Every project's container binds the ideas read-only (5kd.3); the one
  // container whose work is writing them must not inherit that.
  const c = brainstormConfiguration(input)
  assert.ok(!c.mounts.some((m) => m.includes('agent-container/ideas') && /readonly/.test(m)), c.mounts.join('\n'))
})

test('the Brainstorm container cannot write a verification request either', () => {
  // Task fo3.1.1: every generated configuration binds the requests read-only,
  // this one too. It is the one container that drops a read-only bind (the
  // ideas'), so a filter widened by a character would drop this one with it,
  // and the Brainstorm would be a container that can make every other
  // project's agent run what it wrote.
  const c = brainstormConfiguration(input)
  assert.ok(
    c.mounts.includes(
      'source=/home/dev/.claude/agent-container/verifications/requests,target=/config/.claude/agent-container/verifications/requests,type=bind,readonly',
    ),
    c.mounts.join('\n'),
  )
})

test("it keeps what every project's container needs: ~/.claude, the rules tmpfs, the image's own command", () => {
  const c = brainstormConfiguration(input)
  assert.ok(c.mounts.includes('source=/home/dev/.claude,target=/config/.claude,type=bind'))
  assert.ok(c.mounts.includes('target=/config/.claude/rules,type=tmpfs'))
  assert.equal(c.overrideCommand, false)
  assert.equal(c.containerEnv['TZ'], 'America/Sao_Paulo')
})

test('it is ours, and told apart from a project configuration', () => {
  const text = serialise(brainstormConfiguration(input))
  assert.equal(isOurs(text), true)
  assert.equal(isBrainstorm(text), true)
  assert.equal(isBrainstorm(serialise(buildConfiguration({ ...input, projectRoot: '/home/dev/app' }))), false)
  assert.equal(isBrainstorm(null), false)
  assert.equal(isBrainstorm('{ not json'), false)
})

test('a first run writes the configuration and the memory marker into the ideas folder', () => {
  const plan = planBrainstorm({ configuration: brainstormConfiguration(input), existingConfig: null, markerPresent: false })
  assert.ok('writes' in plan)
  if (!('writes' in plan)) return
  assert.deepEqual(plan.writes.map((w) => w.rel).sort(), [MEMORY_MARKER, CONFIG_PATH].sort())
  assert.match(plan.writes.find((w) => w.rel === MEMORY_MARKER)?.text ?? '', /\S/)
})

test('a second run reuses everything: the same bytes, so nothing is written and the container is not recreated', () => {
  const configuration = brainstormConfiguration(input)
  assert.equal(serialise(brainstormConfiguration(input)), serialise(configuration))
  const plan = planBrainstorm({ configuration, existingConfig: serialise(configuration), markerPresent: true })
  assert.deepEqual(plan, { writes: [] })
})

test('an older generation of ours is rewritten; the marker the developer may have edited is left as it is', () => {
  const configuration = brainstormConfiguration(input)
  const older = serialise(brainstormConfiguration({ ...input, extensionVersion: '1.0.0' }))
  const plan = planBrainstorm({ configuration, existingConfig: older, markerPresent: true })
  assert.ok('writes' in plan)
  if (!('writes' in plan)) return
  assert.deepEqual(plan.writes.map((w) => w.rel), [CONFIG_PATH])
})

test("a configuration in the ideas folder that is not Brainstorm's is refused, never overwritten", () => {
  const configuration = brainstormConfiguration(input)
  for (const existing of ['{"name":"mine"}\n', serialise(buildConfiguration({ ...input, projectRoot: IDEAS })), '{ broken']) {
    const plan = planBrainstorm({ configuration, existingConfig: existing, markerPresent: false })
    assert.ok('refused' in plan, existing)
    if ('refused' in plan) assert.match(plan.refused, /\.devcontainer\/devcontainer\.json/)
  }
})

test('the new window reopens the ideas folder in its container when Brainstorm handed it over', () => {
  const now = 1_000_000
  assert.equal(startupAction({ folder: IDEAS, at: now - 1000, then: 'reopen' }, IDEAS, now), 'reopen')
  assert.equal(startupAction({ folder: IDEAS, at: now - 1000 }, IDEAS, now), 'prepare')
  assert.equal(startupAction({ folder: IDEAS, at: now - 1000, then: 'reopen' }, '/elsewhere', now), 'nothing')
  assert.equal(startupAction({ folder: IDEAS, at: now - 10 * 60 * 1000, then: 'reopen' }, IDEAS, now), 'nothing')
})
