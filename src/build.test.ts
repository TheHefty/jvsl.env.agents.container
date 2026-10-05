import { MANIFEST } from './stack-manifest.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildOutcome,
  composeAndBuildCommand,
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
    for (const tool of ['jq', 'docker'] as const) {
      const name = packageFor(manager, tool)
      assert.ok(name && name.length > 0, `${manager}:${tool}`)
    }
  }
})

test('a tool the table does not know maps to nothing rather than to a guess', () => {
  assert.equal(packageFor('apt', 'nosuchtool' as 'jq'), null)
})

const ready: HostChecks = { jq: true, docker: 'ok', manager: 'apt' }

test('a ready host has no problems', () => {
  assert.deepEqual(hostProblems(ready), [])
})

test('a missing tool is named with the package this host installs it from', () => {
  const [problem] = hostProblems({ ...ready, jq: false })
  assert.match(problem?.message ?? '', /jq/)
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
  const [problem] = hostProblems({ jq: false, docker: 'ok', manager: null })
  assert.match(problem?.message ?? '', /jq/)
  assert.equal(problem?.blocking, true)
})

test('the compose command invokes the carried script, with the project manifest', () => {
  const c = composeCommand('/ext', '/work/my-project', ['java', 'python'])
  assert.equal(c.script, '/ext/core/compose-dockerfile.sh')
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
  // Every project built on the template still has one, carrying whatever
  // version it last bumped to. A fallback would make what runs depend on
  // which project it is.
  //
  // The slash is the whole assertion. The manifest's name is the
  // manifest's own name, at the workspace root, and it keeps that name after
  // the submodule is gone — the first version of this test forbade the
  // substring and failed on the manifest, which is the thing the build is
  // supposed to read.
  const c = composeCommand('/ext', '/work/my-project', ['java'])
  const everything = [c.script, c.manifest, c.context, c.image, ...c.stacks].join(' ')
  assert.ok(!everything.includes('.code-server/'), everything)
})

test('the shell command composes and builds, reading nothing from the project but its manifest', () => {
  const c = composeCommand('/ext', '/work/my-project', ['java'])
  const { shellArgs } = composeAndBuildCommand(c, '/tmp/out.Dockerfile')
  const script = shellArgs[shellArgs.length - 1] ?? ''
  assert.match(script, /STACK_MANIFEST=/)
  assert.ok(script.includes('/ext/core/compose-dockerfile.sh'), script)
  assert.ok(script.includes('docker build'), script)
  // The context, which is the part most easily got wrong.
  assert.match(script, /docker build -f \S+ -t \S+ '\/ext'/)
  // And the redirect covers the composer too, not just the last command:
  // `A; B </dev/null` redirects B alone, which would leave the composer with
  // the terminal's pty on stdin and a question nobody can see.
  assert.match(script, /^\{[\s\S]*\} <\/dev\/null$/)
})

test('a path with a space in it does not become a quoting problem', () => {
  // The function this replaced passed the script as $0 rather than inside the
  // command string, so a space was never a quoting problem. Composing means a
  // command string again, so the quoting is deliberate rather than inherited.
  const c = composeCommand('/my ext', '/work/my project', ['java'])
  const { shellArgs } = composeAndBuildCommand(c, '/tmp/out file.Dockerfile')
  const script = shellArgs[shellArgs.length - 1] ?? ''
  assert.ok(script.includes("'/my ext/core/compose-dockerfile.sh'"), script)
  assert.ok(script.includes(`'/work/my project/${MANIFEST}'`), script)
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
