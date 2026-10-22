import { projectNames } from './devcontainer.ts'
import { MANIFEST } from '../shared/stack-manifest.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildOutcome,
  buildInvocation,
  handsOver,
  composeCommand,
  detectManager,
  hostProblems,
  packageFor,
  type HostChecks,
} from './build.ts'

/**
 * What building is, as the parts of it that can be wrong.
 *
 * None of this needs an editor. What a mock of `createTerminal` would assert is
 * that it was handed what `composeAndBuildCommand` returned, which is a test of
 * the mock.
 */

test('an exit code of zero is a build that worked', () => {
  assert.equal(buildOutcome(0), 'ok')
})

test('a non-zero exit code is a failure', () => {
  assert.equal(buildOutcome(1), 'failed')
  assert.equal(buildOutcome(127), 'failed')
})

test('no exit code at all is a cancellation, not a failure', () => {
  // FR-66 asks for this specifically, and it is the thing that would otherwise be
  // indistinguishable: a terminal closed mid-build leaves no code, and reporting
  // that as a failure makes "I stopped it" look like "it broke".
  assert.equal(buildOutcome(undefined), 'cancelled')
})

test('the package manager is the one whose command is on PATH', () => {
  // The same detection `init` has used for a year, rather than parsing
  // /etc/os-release: a distribution that renames itself still has its manager.
  assert.equal(detectManager((cmd) => cmd === 'apt-get'), 'apt')
  assert.equal(detectManager((cmd) => cmd === 'dnf'), 'dnf')
  assert.equal(detectManager((cmd) => cmd === 'pacman'), 'pacman')
  assert.equal(detectManager(() => false), null)
})

test('each tool has a package name in every manager', () => {
  // The table's whole reason for existing: a wrong name installs the wrong thing,
  // and an absent one installs nothing while appearing to succeed. The shell copy
  // this replaces had a test asserting exactly this, in both directions.
  for (const manager of ['apt', 'dnf', 'pacman'] as const) {
    for (const tool of ['docker'] as const) {
      const name = packageFor(manager, tool)
      assert.ok(name && name.length > 0, `${manager}:${tool}`)
    }
  }
})

test('a tool the table does not know maps to nothing rather than to a guess', () => {
  assert.equal(packageFor('apt', 'nosuchtool' as 'docker'), null)
})

const ready: HostChecks = { docker: 'ok', manager: 'apt' }

test('a ready host has no problems', () => {
  assert.deepEqual(hostProblems(ready), [])
})

test('a missing tool is named with the package this host installs it from', () => {
  const [problem] = hostProblems({ ...ready, docker: 'absent' })
  assert.match(problem?.message ?? '', /docker\.io/)
  assert.match(problem?.message ?? '', /install/i)
  assert.equal(problem?.blocking, true)
})

test('a docker that is installed and refuses this user is told apart from an absent one', () => {
  const unusable = hostProblems({ ...ready, docker: 'unusable' })[0]
  const absent = hostProblems({ ...ready, docker: 'absent' })[0]
  assert.match(unusable?.message ?? '', /not usable by this user|group/i)
  assert.ok(!/not installed|install docker/i.test(unusable?.message ?? ''), unusable?.message)
  assert.match(absent?.message ?? '', /install/i)
})

test('a check that could not answer in time does not block', () => {
  // `docker info` hangs when the daemon is unreachable rather than failing, so an
  // activation that waits for it is a window opening slowly with nothing saying
  // why. Unknown is reported and does not stop a build being attempted: being
  // wrong in the direction of "I could not tell" is the only acceptable one here.
  const [problem] = hostProblems({ ...ready, docker: 'unknown' })
  assert.equal(problem?.blocking, false)
  assert.match(problem?.message ?? '', /could not|unknown/i)
})

test('with no known package manager the tool is still named', () => {
  // Naming the package is the nicety; naming what is missing is the point.
  const [problem] = hostProblems({ docker: 'absent', manager: null })
  assert.match(problem?.message ?? '', /docker/)
  assert.equal(problem?.blocking, true)
})

test('jq is not asked for: the composer is TypeScript, and a Windows host never has it', () => {
  assert.deepEqual(hostProblems({ docker: 'ok', manager: null }), [])
})

test('the compose plan names the extension\'s files, the stacks and the project manifest', () => {
  const c = composeCommand('/ext', '/work/my-project', ['java', 'python'])
  assert.equal(c.root, '/ext')
  assert.deepEqual(c.stacks, ['java', 'python'])
  assert.equal(c.manifest, `/work/my-project/${MANIFEST}`)
})

test('the build context is the extension, not the workspace', () => {
  // The composed Dockerfile has `COPY core/…` and `COPY stacks/…`, relative to
  // the context. A context of the workspace builds nothing — or worse, builds
  // whatever a project happens to have at those paths.
  const c = composeCommand('/ext', '/work/my-project', [])
  assert.equal(c.context, '/ext')
})

test('the image is named the way the generated configuration references it', () => {
  // devcontainer.ts writes `image: <basename>-dev`. A build that tags anything
  // else produces an image the configuration does not point at, and the open
  // fails naming a missing image that was just built.
  const c = composeCommand('/ext', '/work/my-project', [])
  assert.equal(c.image, 'my-project-dev')
})

test('nothing in the build names a path inside a .code-server/ submodule', () => {
  // The slash is the whole assertion: the manifest keeps its own name at the
  // workspace root after the submodule is gone.
  const c = composeCommand('/ext', '/work/my-project', ['java'])
  const everything = [c.root, c.manifest, c.context, c.image, ...c.stacks].join(' ')
  assert.ok(!everything.includes('.code-server/'), everything)
})

test('the build reads the Dockerfile from its input, with the extension as context', () => {
  // Composed in this process (the-composer-is-typescript): no shell, no temporary
  // file, and nothing from the project but its manifest.
  const c = composeCommand('/ext', '/work/my-project', ['java'])
  const b = buildInvocation(c, 'FROM x\n', { kind: 'local' })
  assert.deepEqual(b, {
    command: 'docker',
    args: ['build', '-f', '-', '-t', 'my-project-dev', '/ext'],
    input: 'FROM x\n',
  })
})

test('a path with a space in it stays one argument, with no shell to quote for', () => {
  const c = composeCommand('/my ext', '/work/my project', ['java'])
  const b = buildInvocation(c, 'FROM x\n', { kind: 'local' })
  assert.equal(b.args.at(-1), '/my ext')
  assert.equal(b.args.filter((a) => a === '/my ext').length, 1)
})

test('for a WSL project the build runs through the distro\'s docker', () => {
  const c = composeCommand('/ext', '/work/p', [])
  const b = buildInvocation(c, 'FROM x\n', { kind: 'wsl', distro: 'Ubuntu' })
  assert.equal(b.command, 'wsl.exe')
  assert.deepEqual(b.args.slice(0, 5), ['-d', 'Ubuntu', '--exec', 'docker', 'build'])
})

test('the handover is reachable from a successful build and from nothing else', () => {
  // Two opposite bad outcomes. Refusing to hand over after a good build strands
  // somebody with a built image and a window that never attached; handing over
  // after a cancelled one attaches them to a half-built image they asked to
  // stop. buildOutcome already tells the three apart — this is the assertion
  // that the chain does not lose it.
  assert.equal(handsOver(buildOutcome(0)), true)
  assert.equal(handsOver(buildOutcome(1)), false)
  assert.equal(handsOver(buildOutcome(undefined)), false)
})

// --- the agents' sandbox under AppArmor (debt: the-sandbox-under-apparmor) ---

import { sandboxWarnings } from './build.ts'

test('a host with neither condition gets no sandbox warning', () => {
  // The operator's Arch host: no AppArmor in Docker, no Ubuntu restriction.
  assert.deepEqual(sandboxWarnings({ dockerAppArmor: false, usernsRestricted: false }), [])
})

test('what could not be read claims nothing', () => {
  assert.deepEqual(sandboxWarnings({ dockerAppArmor: 'unknown', usernsRestricted: 'unknown' }), [])
})

test('the kernel restriction is named, with the setting and what to decide', () => {
  const [w] = sandboxWarnings({ dockerAppArmor: false, usernsRestricted: true })
  assert.ok(w)
  assert.equal(w.blocking, false, 'the image builds; only the sandbox fails')
  assert.match(w.message, /apparmor_restrict_unprivileged_userns/)
  assert.match(w.message, /sandbox/)
})

test('Docker\'s AppArmor confinement is named, and nothing is changed for the operator', () => {
  const [w] = sandboxWarnings({ dockerAppArmor: true, usernsRestricted: false })
  assert.ok(w)
  assert.equal(w.blocking, false)
  assert.match(w.message, /AppArmor/)
  assert.match(w.message, /mount/)
})

test('both conditions are two warnings, neither blocking', () => {
  const ws = sandboxWarnings({ dockerAppArmor: true, usernsRestricted: true })
  assert.equal(ws.length, 2)
  assert.ok(ws.every((w) => !w.blocking))
})

test('the sandbox warnings join the host problems without blocking a build', () => {
  const problems = hostProblems({ ...ready, sandbox: { dockerAppArmor: true, usernsRestricted: true } })
  assert.equal(problems.filter((p) => p.blocking).length, 0)
  assert.equal(problems.length, 2)
})

// --- a rebuilt image reaches the container (debt: a-rebuilt-image-does-not-reach-the-running-container)

import { afterBuild, REBUILD_IN_CONTAINER, REBUILD_FROM_HOST } from './build.ts'

const NEW = 'sha256:aaaa'
const OLD = 'sha256:bbbb'
const one = (image: string) => ({ kind: 'one' as const, id: 'c1', name: 'demo_devcontainer', image })

test('a container on the image just built needs nothing said', () => {
  assert.deepEqual(afterBuild({ built: NEW, container: one(NEW), inContainer: true }), { say: 'nothing' })
})

test('no container for the project needs nothing said', () => {
  assert.deepEqual(afterBuild({ built: NEW, container: { kind: 'none' }, inContainer: false }), { say: 'nothing' })
})

test('a container on an older image is named, and recreating it is offered through Dev Containers', () => {
  const inWindow = afterBuild({ built: NEW, container: one(OLD), inContainer: true })
  assert.equal(inWindow.say, 'stale')
  assert.ok(inWindow.say === 'stale' && inWindow.message.includes('demo_devcontainer'))
  assert.ok(inWindow.say === 'stale' && inWindow.command === REBUILD_IN_CONTAINER)
  const fromHost = afterBuild({ built: NEW, container: one(OLD), inContainer: false })
  assert.ok(fromHost.say === 'stale' && fromHost.command === REBUILD_FROM_HOST)
})

test('the decision never removes anything: its only action is a Dev Containers command for the user to choose', () => {
  const d = afterBuild({ built: NEW, container: one(OLD), inContainer: true })
  assert.ok(d.say === 'stale' && d.command.startsWith('remote-containers.'))
  assert.ok(!JSON.stringify(d).includes('docker rm'))
})

test('several containers for the project are named, and none is offered', () => {
  const d = afterBuild({ built: NEW, container: { kind: 'many', names: ['a', 'b'] }, inContainer: false })
  assert.equal(d.say, 'ambiguous')
  assert.ok(d.say === 'ambiguous' && d.message.includes('a') && d.message.includes('b'))
})

test('an image that could not be read claims nothing', () => {
  assert.deepEqual(afterBuild({ built: undefined, container: one(OLD), inContainer: true }), { say: 'nothing' })
  assert.deepEqual(afterBuild({ built: NEW, container: one(''), inContainer: true }), { say: 'nothing' })
})

test('on Windows the build\'s refusals name Docker Desktop, installed or started', () => {
  const absent = hostProblems({ docker: 'absent', manager: null }, 'win32')[0]
  const unusable = hostProblems({ docker: 'unusable', manager: null }, 'win32')[0]
  assert.match(absent?.message ?? '', /Docker Desktop is not installed.*https:\/\/docs\.docker\.com\/desktop\//)
  assert.match(unusable?.message ?? '', /start Docker Desktop/i)
  assert.equal(absent?.blocking && unusable?.blocking, true)
})

test('the build tags the image the configuration names, for any folder', () => {
  // Two derivations of one name is how an image gets built under one name and
  // looked for under another, and the open fails naming an image just built.
  for (const folder of ['/work/MyProject', '/work/my project', '/work/kotodori']) {
    assert.equal(composeCommand('/ext', folder, []).image, projectNames(folder).image, folder)
  }
})
