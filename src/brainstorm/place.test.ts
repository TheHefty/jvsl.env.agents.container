import { test } from 'node:test'
import assert from 'node:assert/strict'

import { brainstormPlace, defaultDistroArgv, openTarget } from './place.ts'
import { brainstormConfiguration } from './brainstorm.ts'
import { readLimits } from '../build/limits.ts'
import { mountPath, pickedProject } from '../host/locate.ts'
import { handoverFolder } from '../open/handover.ts'

// --- Brainstorm on WSL uses the default distro (story 5kd.2, gh-364; task
// brainstorm-on-wsl-uses-the-default-distro) ------------------------------
//
// On a Windows host the ideas live in the default distro user's ~/.claude, as
// the journal does, and no question is asked. The failures guarded: a Windows
// path reaching the distro's docker, which binds nothing or the wrong
// credentials; a distro that does not answer, or answers nonsense, being
// written into anyway; and the window opened on the ideas folder not matching
// its handover, so it opens and never reopens in the container.

type Call = { command: string; args: string[] }
function runner(answers: Array<string | Error>): { calls: Call[]; run: (c: string, a: string[]) => Promise<{ stdout: string; stderr: string }> } {
  const calls: Call[] = []
  return {
    calls,
    run: (command, args) => {
      calls.push({ command, args })
      const next = answers.shift()
      if (next === undefined) return Promise.reject(new Error('no more answers'))
      return next instanceof Error ? Promise.reject(next) : Promise.resolve({ stdout: next, stderr: '' })
    },
  }
}

const IDEAS_LINUX = '/home/dev/.claude/agent-container/ideas'

test('the default distro is asked for by not naming one', () => {
  const { command, args } = defaultDistroArgv()
  assert.equal(command, 'wsl.exe')
  assert.ok(!args.includes('-d'), `no -d, so wsl.exe picks the default: ${args.join(' ')}`)
  assert.ok(args.join(' ').includes('WSL_DISTRO_NAME'))
})

test('on Windows the ideas folder is in the default distro user\'s ~/.claude', async () => {
  const r = runner(['Ubuntu', '/home/dev'])
  const place = await brainstormPlace('win32', r.run, 'C:\\Users\\dev')
  assert.ok(place.ok, JSON.stringify(place))
  assert.deepEqual(place.project, {
    kind: 'wsl',
    distro: 'Ubuntu',
    path: '\\\\wsl.localhost\\Ubuntu\\home\\dev\\.claude\\agent-container\\ideas',
    linux: IDEAS_LINUX,
  })
  assert.equal(place.home, '/home/dev')
  assert.deepEqual(r.calls[1]?.args.slice(0, 2), ['-d', 'Ubuntu'], 'the home is read from the distro that answered')
})

test('no Windows path reaches the distro\'s docker', async () => {
  const place = await brainstormPlace('win32', runner(['Ubuntu', '/home/dev']).run, 'C:\\Users\\dev')
  assert.ok(place.ok)
  const configuration = brainstormConfiguration({
    ideasDir: mountPath(place.project),
    homeDir: place.home,
    extensionVersion: '1.2.3',
    limits: readLimits('{}', 8).limits,
    facts: { cpuCount: 8, devicesPresent: [], devicesAbsent: [] },
  })
  const text = JSON.stringify(configuration)
  assert.ok(!/C:|Users|wsl\.localhost/.test(text), `a Windows path in the configuration: ${text}`)
  assert.ok(configuration.mounts.includes('source=/home/dev/.claude,target=/config/.claude,type=bind'), configuration.mounts.join('\n'))
  assert.ok(text.includes(IDEAS_LINUX), 'the workspace is the ideas folder inside the distro')
})

test('a default distro that does not answer is refused, and nothing else is asked', async () => {
  const r = runner([new Error('wsl.exe: no installed distributions')])
  const place = await brainstormPlace('win32', r.run, 'C:\\Users\\dev')
  assert.ok(!place.ok)
  assert.match(place.reason, /default WSL distro/)
  assert.match(place.reason, /no installed distributions/)
  assert.equal(r.calls.length, 1)
})

test('a name that is not a distro name is refused, showing what was given', async () => {
  for (const name of ['', 'Ubuntu\nDebian', 'a\\b', 'a/b']) {
    const place = await brainstormPlace('win32', runner([name, '/home/dev']).run, 'C:\\Users\\dev')
    assert.ok(!place.ok, `accepted ${JSON.stringify(name)}`)
    assert.match(place.reason, /default WSL distro/)
    assert.ok(place.reason.includes(JSON.stringify(name)), place.reason)
  }
})

test('a distro whose home cannot be read is refused, naming the distro', async () => {
  const unreadable = await brainstormPlace('win32', runner(['Ubuntu', new Error('timed out')]).run, 'C:\\Users\\dev')
  assert.ok(!unreadable.ok)
  assert.match(unreadable.reason, /"Ubuntu"/)
  const nonsense = await brainstormPlace('win32', runner(['Ubuntu', 'C:\\Users\\dev']).run, 'C:\\Users\\dev')
  assert.ok(!nonsense.ok)
  assert.match(nonsense.reason, /"Ubuntu"/)
})

test('the window opened on the ideas folder matches its own handover', async () => {
  const place = await brainstormPlace('win32', runner(['Ubuntu', '/home/dev']).run, 'C:\\Users\\dev')
  assert.ok(place.ok)
  const target = openTarget(place.project)
  assert.deepEqual(target, { scheme: 'vscode-remote', authority: 'wsl+Ubuntu', path: IDEAS_LINUX })
  // The new window locates its folder from the URI it was opened on, as a
  // picked folder is; its handover folder has to be the one handed over.
  const opened = pickedProject({ ...target, fsPath: '\\home\\dev\\.claude\\agent-container\\ideas' })
  assert.equal(handoverFolder(opened), place.project.path)
})

test('a distro name that needs encoding still opens in that distro', async () => {
  const place = await brainstormPlace('win32', runner(['Ubuntu 24.04', '/home/dev']).run, 'C:\\Users\\dev')
  assert.ok(place.ok)
  const target = openTarget(place.project)
  assert.equal(target.authority, 'wsl+Ubuntu%2024.04')
  assert.equal(handoverFolder(pickedProject({ ...target, fsPath: '' })), place.project.path)
})

test('on Linux nothing is asked and the folder is in this home', async () => {
  const r = runner([])
  const place = await brainstormPlace('linux', r.run, '/home/dev')
  assert.ok(place.ok)
  assert.deepEqual(place.project, { kind: 'host', path: IDEAS_LINUX })
  assert.equal(place.home, '/home/dev')
  assert.deepEqual(openTarget(place.project), { scheme: 'file', authority: '', path: IDEAS_LINUX })
  assert.equal(r.calls.length, 0)
})
