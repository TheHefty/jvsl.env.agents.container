import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseVersion } from './template.ts'

/**
 * The manifest is a contract, and three of its fields are the kind that fail
 * silently. The rules live here with negative fixtures beside them, so the
 * check has been seen rejecting each thing it is supposed to reject rather than
 * only accepting the file that happens to be correct today.
 */
interface Manifest {
  extensionKind?: unknown
  extensionDependencies?: unknown
  activationEvents?: unknown
  main?: unknown
  scripts?: Record<string, unknown>
}

const DEV_CONTAINERS = 'ms-vscode-remote.remote-containers'

function problems(m: Manifest): string[] {
  const found: string[] = []

  if (!Array.isArray(m.extensionKind) || m.extensionKind.join() !== 'ui') {
    found.push(
      'extensionKind must be exactly ["ui"]: the extension controls host Docker and reads the ' +
        "host's hardware, and from the remote extension host it would read the container's " +
        'numbers as the host\'s with nothing erroring',
    )
  }

  if (!Array.isArray(m.extensionDependencies) || !m.extensionDependencies.includes(DEV_CONTAINERS)) {
    found.push(
      `extensionDependencies must include ${DEV_CONTAINERS}, hard, so installing on an editor ` +
        'build that cannot use it fails at install time rather than degrading in silence',
    )
  }

  const events = Array.isArray(m.activationEvents) ? m.activationEvents : []
  if (!events.includes('workspaceContains:.code-server.stack.json')) {
    found.push(
      'activation must name .code-server.stack.json at the project root. An uninitialized ' +
        'submodule leaves .code-server/ existing and empty, so an event naming a path inside it ' +
        'never fires — in exactly the case a project has to be refused',
    )
  }
  // **The rule is "not only submodule paths", not "no submodule paths",** and it
  // was the second of those until an event naming `.code-server/setup` was added
  // for a real reason: a project that has never run `setup` has no manifest, so
  // the manifest event does not fire, and the thing whose purpose is to produce a
  // manifest would never start.
  //
  // What has to stay true is that **something** activates without the submodule
  // being checked out, because that is the case a project most needs to be told
  // about — `.code-server/` exists and is empty after a clone without
  // `--recursive`, and an event naming anything inside it never fires. So this
  // asserts at least one event outside it rather than none inside.
  const outside = events.filter(
    (event) => typeof event === 'string' && !event.includes('.code-server/'),
  )
  if (outside.length === 0) {
    found.push(
      'every activation event names a path inside the submodule, which is empty when the ' +
        'submodule is not initialised — so nothing would activate in exactly the case a project ' +
        'has to be refused',
    )
  }

  if (typeof m.main !== 'string' || !m.main.includes('dist/')) {
    found.push('main must point at the bundle in dist/')
  }

  const prepublish = m.scripts?.['vscode:prepublish']
  if (typeof prepublish !== 'string' || !prepublish.includes('build')) {
    found.push(
      'scripts["vscode:prepublish"] must run the build. vsce packages whatever dist/ happens to ' +
        'be on disk and takes the version from this file, so without it a .vsix carries the ' +
        "current version string and the previous bundle — a published extension whose version " +
        'and behaviour disagree, with nothing saying so. That happened: a build reporting 0.2.1 ' +
        'behaved as 0.2.0, and the cause was not found at the time',
    )
  }

  return found
}

const real = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
) as Manifest

const good: Manifest = {
  extensionKind: ['ui'],
  extensionDependencies: [DEV_CONTAINERS],
  activationEvents: ['workspaceContains:.code-server.stack.json'],
  main: './dist/extension.js',
  scripts: { 'vscode:prepublish': 'npm run build' },
}

test('this repository\'s own manifest holds', () => {
  assert.deepEqual(problems(real), [])
})

test('a manifest that runs in the wrong extension host is rejected', () => {
  for (const kind of [undefined, [], ['workspace'], ['ui', 'workspace']]) {
    const found = problems({ ...good, extensionKind: kind })
    assert.ok(found.some((p) => p.includes('extensionKind')), JSON.stringify(kind))
  }
})

test('a soft dependency on the container tooling is rejected', () => {
  const found = problems({ ...good, extensionDependencies: [] })
  assert.ok(found.some((p) => p.includes('extensionDependencies')), found.join('\n'))
})

test('activating only on paths inside the submodule is rejected', () => {
  const found = problems({ ...good, activationEvents: ['workspaceContains:.code-server/version.txt'] })
  assert.ok(found.some((p) => p.includes('.code-server.stack.json')), found.join('\n'))
  assert.ok(found.some((p) => p.includes('inside the submodule')), found.join('\n'))
})

test('a submodule path alongside one outside it is accepted', () => {
  // The shape this repository actually ships: the manifest at the root, which
  // fires for a project that has one, plus `.code-server/setup`, which fires for
  // a project that has never run it. Neither alone covers both.
  const found = problems({
    ...good,
    activationEvents: [
      'workspaceContains:.code-server.stack.json',
      'workspaceContains:.code-server/setup',
    ],
  })
  assert.deepEqual(found, [])
})

test('a main that does not point at the bundle is rejected', () => {
  const found = problems({ ...good, main: './src/extension.ts' })
  assert.ok(found.some((p) => p.includes('main')), found.join('\n'))
})

test('packaging without building what it packages is rejected', () => {
  // The defect this catches shipped once and was diagnosed as "reinstall and
  // fully quit the editor", which happened to work and taught nothing. The
  // bundle is not rebuilt by `vsce package`; only this hook rebuilds it.
  for (const scripts of [
    undefined,
    {},
    { 'vscode:prepublish': '' },
    { 'vscode:prepublish': 'echo packaged' },
    { prepublish: 'npm run build' },
    { 'vscode:prepublish': 42 },
  ]) {
    const found = problems({ ...good, scripts: scripts as Record<string, unknown> | undefined })
    assert.ok(
      found.some((p) => p.includes('vscode:prepublish')),
      JSON.stringify(scripts),
    )
  }
})

test('a prepublish that runs the build is accepted', () => {
  for (const command of ['npm run build', 'npm run build --silent', 'npm run typecheck && npm run build']) {
    const found = problems({ ...good, scripts: { 'vscode:prepublish': command } })
    assert.deepEqual(found, [], command)
  }
})
