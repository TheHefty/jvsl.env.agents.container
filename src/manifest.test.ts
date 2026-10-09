import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'


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
  engines?: unknown
  contributes?: unknown
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
  // **The rule inverted, and the version this comment used to argue for is
  // gone.** It read "not only submodule paths, not none" and explained why an
  // event naming `.code-server/setup` had been added: a project that has never
  // been configured has no manifest, so the manifest event does not fire, and
  // the thing whose purpose is to produce a manifest would never start.
  //
  // That event went with FR-22, and **the reasoning survived the thing it
  // justified** — which is a dangling reference: a reader follows it looking for
  // an event and finds none. What actually holds now was checked rather than
  // reasoned about: since VS Code 1.74.0 a command in `contributes.commands`
  // activates the extension with no `onCommand` event at all, so an
  // unconfigured project reaches the configure command from the palette. The
  // extension simply no longer wakes up on its own there, and until a manifest
  // exists it has nothing to do on its own.
  //
  // So the rule is **none**, not "not only".
  const inside = events.filter(
    (event) => typeof event === 'string' && event.includes('.code-server/'),
  )
  if (inside.length > 0) {
    found.push(
      'an activation event names a path inside .code-server/: ' +
        `${inside.join(', ')}. A project is not required to have a submodule, and one that ` +
        'still does carries whatever version it last bumped to — so nothing may wake up on it',
    )
  }

  // **The floor everything above rests on.** Implicit command activation is a
  // platform behaviour with a version floor, and it is the only path an
  // unconfigured project has. A bump that lowered this would remove it
  // silently: the symptom is "the command does nothing", which reads as a
  // broken extension rather than as a manifest that asks for too little.
  const engines = typeof m.engines === 'object' && m.engines !== null
    ? (m.engines as Record<string, unknown>)
    : {}
  const vscodeEngine = typeof engines['vscode'] === 'string' ? engines['vscode'] : ''
  const floor = /^\^?(\d+)\.(\d+)/.exec(vscodeEngine)
  const major = floor ? Number(floor[1]) : 0
  const minor = floor ? Number(floor[2]) : 0
  if (major < 1 || (major === 1 && minor < 74)) {
    found.push(
      `engines.vscode is ${vscodeEngine || '(absent)'}, below 1.74 — the version from which a ` +
        'contributed command activates the extension without an onCommand event. Below it, a ' +
        'project with no manifest has no way to reach the configure command at all',
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
  engines: { vscode: '^1.90.0' },
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

test('an event naming a path inside the submodule is rejected', () => {
  // It used to be rejected only when it was the *only* event. A project is not
  // required to have a submodule at all now, and one that still does carries
  // whatever version it last bumped to, so nothing may wake up on it.
  const found = problems({ ...good, activationEvents: ['workspaceContains:.code-server/version.txt'] })
  assert.ok(found.some((p) => p.includes('.code-server.stack.json')), found.join('\n'))
  assert.ok(found.some((p) => p.includes('inside .code-server/')), found.join('\n'))
})

test('a submodule path alongside one outside it is rejected too', () => {
  // **This test asserted the opposite until today, and the reason it gave was
  // sound when it was written:** the manifest event fires for a project that has
  // one, and `.code-server/setup` fired for a project that had never run it, and
  // neither alone covered both. What replaced the second is not another event —
  // it is that a contributed command activates the extension on its own from
  // VS Code 1.74, which the floor below asserts.
  const found = problems({
    ...good,
    activationEvents: [
      'workspaceContains:.code-server.stack.json',
      'workspaceContains:.code-server/setup',
    ],
  })
  assert.ok(found.some((p) => p.includes('inside .code-server/')), found.join('\n'))
})

test('an engines floor below 1.74 is rejected', () => {
  // The only path an unconfigured project has. Below this a bump would remove
  // it silently, and the symptom is "the command does nothing".
  for (const v of ['^1.73.0', '1.60.0', '', undefined]) {
    const found = problems({ ...good, engines: v === undefined ? undefined : { vscode: v } })
    assert.ok(found.some((p) => p.includes('1.74')), JSON.stringify(v) + ': ' + found.join('\n'))
  }
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
    const found = problems({ ...good, scripts: scripts })
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

test('the folder picker is contributed, and declares no onCommand event for itself', () => {
  // Its reachability with no folder open is the implicit activation asserted
  // above — a contributed command activates the extension on its own from
  // VS Code 1.74. An explicit onCommand event would work too and would hide
  // that the engines floor is what this rests on.
  const contributes = typeof real.contributes === 'object' && real.contributes !== null
    ? (real.contributes as Record<string, unknown>)
    : {}
  const commands = Array.isArray(contributes['commands']) ? contributes['commands'] : []
  const ids = commands.map((c: unknown) =>
    typeof c === 'object' && c !== null ? (c as Record<string, unknown>)['command'] : undefined,
  )
  assert.ok(ids.includes('jvsl.agentContainer.open'), JSON.stringify(ids))
  assert.ok(ids.includes('jvsl.agentContainer.showWork'), JSON.stringify(ids))
  assert.ok(ids.includes('jvsl.agentContainer.migrate'), JSON.stringify(ids))
  const events = Array.isArray(real.activationEvents) ? real.activationEvents : []
  assert.deepEqual(events.filter((e: unknown) => String(e).startsWith('onCommand:')), [])
})

test('the create command is contributed, with the Agent Container prefix', () => {
  const contributes = typeof real.contributes === 'object' && real.contributes !== null
    ? (real.contributes as Record<string, unknown>)
    : {}
  const commands = Array.isArray(contributes['commands']) ? contributes['commands'] : []
  const create = commands.find(
    (c: unknown) =>
      typeof c === 'object' && c !== null &&
      (c as Record<string, unknown>)['command'] === 'jvsl.agentContainer.create',
  ) as Record<string, unknown> | undefined
  assert.ok(create, JSON.stringify(commands))
  // The prefix is what stops it interleaving with the Dev Containers
  // extension's own commands, where singular versus plural was the only
  // difference and nobody noticed it.
  assert.match(String(create['title']), /^Agent Container: /)
})

test('activation reaches a window with no folder, and the manifest event stays', () => {
  const events = Array.isArray(real.activationEvents) ? real.activationEvents : []
  // The panel has to exist before anybody asks for it, which no command-triggered
  // activation gives. The cost is loading in every window on the host, which the
  // SRS accepted — and which activation doing the least it can is what pays for.
  assert.ok(events.includes('onStartupFinished'), JSON.stringify(events))
  // **Not redundant, and the next person to read them will think they are.**
  // onStartupFinished fires when the editor has settled; a project opened
  // directly wants the extension awake without waiting for that.
  assert.ok(events.includes('workspaceContains:.code-server.stack.json'), JSON.stringify(events))
})
