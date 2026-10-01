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
  templateMinVersion?: unknown
  main?: unknown
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
  for (const event of events) {
    if (typeof event === 'string' && event.includes('.code-server/')) {
      found.push(`activation event "${event}" names a path inside the submodule, which is empty ` +
        'when the submodule is not initialised')
    }
  }

  if (typeof m.templateMinVersion !== 'string' || parseVersion(m.templateMinVersion) === null) {
    found.push('templateMinVersion must be present and parseable, so a tool can answer which ' +
      'template this needs without executing the bundle')
  }

  if (typeof m.main !== 'string' || !m.main.includes('dist/')) {
    found.push('main must point at the bundle in dist/')
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
  templateMinVersion: '2.2.0',
  main: './dist/extension.js',
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

test('activating on a path inside the submodule is rejected', () => {
  const found = problems({ ...good, activationEvents: ['workspaceContains:.code-server/version.txt'] })
  assert.ok(found.some((p) => p.includes('.code-server.stack.json')), found.join('\n'))
  assert.ok(found.some((p) => p.includes('inside the submodule')), found.join('\n'))
})

test('an unparseable or missing templateMinVersion is rejected', () => {
  for (const v of [undefined, '', 'latest', '2.2', 2]) {
    const found = problems({ ...good, templateMinVersion: v })
    assert.ok(found.some((p) => p.includes('templateMinVersion')), JSON.stringify(v))
  }
})

test('a main that does not point at the bundle is rejected', () => {
  const found = problems({ ...good, main: './src/extension.ts' })
  assert.ok(found.some((p) => p.includes('main')), found.join('\n'))
})
