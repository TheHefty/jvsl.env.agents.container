import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildConfiguration } from './devcontainer.ts'
import { shippedSources as allSources } from '../test-support/sources.ts'

/**
 * Workspace Trust stays enabled, and nothing here writes it.
 *
 * It is the editor's own defence against `.vscode/tasks.json` running on
 * `folderOpen` — on the host, outside the sandbox, with the person's own
 * privileges. The story's gate settled that it is never disabled; this is two
 * of the three surfaces a setting can reach the editor through. The third is
 * the image's metadata label, which is composed in the template and asserted
 * there, by `core/check-devcontainer-metadata.sh`.
 *
 * **What this cannot see.** The source scan matches a literal, so a key
 * assembled at runtime — `'security.workspace.' + 'trust.enabled'` — would
 * pass it. That is accepted: the check is here to stop the setting arriving by
 * accident or by a later edit made for an unrelated reason, not to defeat
 * somebody deliberately hiding it in the extension's own source.
 */
const PREFIX = 'security.workspace.trust'

interface Source {
  path: string
  text: string
}

/** Surface 1: the extension's own code never names the setting. */
function sourcesThatNameTrust(sources: Source[]): string[] {
  return sources
    .filter((source) => source.text.includes(PREFIX))
    .map(
      (source) =>
        `${source.path} names ${PREFIX}. Workspace Trust is never written here: it is what ` +
        'stops a tasks.json planted inside the sandbox from running outside it',
    )
}

/**
 * Surface 2: nothing the extension generates carries such a key.
 *
 * The whole configuration is walked rather than only
 * `customizations.vscode.settings`, because a setting reaches the editor
 * through more than one spelling of that path — `customizations` is keyed by
 * tool, and the specification also merges what the image's label declares.
 * Walking everything costs nothing and cannot be outlived by a shape change.
 */
function keysUnderTrust(value: unknown, at = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => keysUnderTrust(item, `${at}[${index}]`))
  }
  if (typeof value !== 'object' || value === null) {
    return []
  }
  const found: string[] = []
  for (const [key, child] of Object.entries(value)) {
    const here = `${at}.${key}`
    if (key.startsWith(PREFIX)) {
      found.push(`${here} is a Workspace Trust setting, and the configuration may not carry one`)
    }
    found.push(...keysUnderTrust(child, here))
  }
  return found
}

// The whole of src/, not this file's folder: see test-support/sources.ts.
const shippedSources = (): Source[] => allSources()

const input = {
  projectRoot: '/home/me/code/myrepo',
  homeDir: '/home/me',
  extensionVersion: '0.2.1',
  limits: { memory: '6g', memorySwap: '8g', cpus: 4, usedDefaults: false },
  facts: { cpuCount: 16, devicesPresent: ['/dev/fuse'], devicesAbsent: [] },
}

test('no shipped source names a Workspace Trust setting', () => {
  const sources = shippedSources()
  // A scan over nothing passes. The count is asserted so that a rename or a
  // move of the sources turns this into a failure rather than into silence.
  assert.ok(sources.length >= 6, `scanned ${sources.length} sources`)
  const found = sourcesThatNameTrust(sources)
  assert.deepEqual(found, [], found.join('\n'))
})

test('a source that updates the setting is rejected', () => {
  const found = sourcesThatNameTrust([
    {
      path: 'extension.ts',
      text: "await workspace.getConfiguration().update('security.workspace.trust.enabled', false, 1)\n",
    },
  ])
  assert.equal(found.length, 1, found.join('\n'))
  assert.ok(found[0]?.includes('extension.ts'), found.join('\n'))
})

test('a source that only reads the setting is rejected too', () => {
  // Reading is harmless, but a read is one edit away from a write and the
  // distinction cannot be drawn by a scanner. Naming it at all is the line.
  const found = sourcesThatNameTrust([
    { path: 'open.ts', text: "const trusted = get('security.workspace.trust.enabled')\n" },
  ])
  assert.equal(found.length, 1, found.join('\n'))
})

test('a source naming an unrelated setting is accepted', () => {
  // The check is about the key, not about the extension mentioning settings.
  const found = sourcesThatNameTrust([
    { path: 'open.ts', text: "get('files.autoSave')\nget('security.allowedUNCHosts')\n" },
  ])
  assert.deepEqual(found, [], found.join('\n'))
})

test('the generated configuration carries no Workspace Trust key', () => {
  const found = keysUnderTrust(buildConfiguration(input))
  assert.deepEqual(found, [], found.join('\n'))
})

test('a configuration that disables trust in its customizations is rejected', () => {
  // The shape story 4 is about to start writing, which is why this exists now
  // rather than when that story needs it.
  const found = keysUnderTrust({
    ...buildConfiguration(input),
    customizations: {
      vscode: {
        extensions: ['redhat.java'],
        settings: { 'security.workspace.trust.enabled': false },
      },
    },
  })
  assert.equal(found.length, 1, found.join('\n'))
  assert.ok(found[0]?.includes('security.workspace.trust.enabled'), found.join('\n'))
  assert.ok(found[0]?.includes('customizations'), found.join('\n'))
})

test('a configuration whose customizations are otherwise is accepted', () => {
  const found = keysUnderTrust({
    ...buildConfiguration(input),
    customizations: {
      vscode: { extensions: ['redhat.java'], settings: { 'java.jdt.ls.java.home': '/usr/lib/jvm' } },
    },
  })
  assert.deepEqual(found, [], found.join('\n'))
})
