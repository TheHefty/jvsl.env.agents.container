import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

/**
 * What ships, and more to the point what does not.
 *
 * Packaged without a .vscodeignore this extension came to 157 files and 334 KB
 * around a 5 KB bundle, the bulk of it the vendored template submodule — a
 * separate product, with its own releases and its own licence, inside an editor
 * extension. Nothing failed; the package was simply twenty times larger than it
 * had any reason to be, and shipped somebody else's source.
 */
function packagedFiles(): string[] {
  const out = execFileSync('npx', ['--no-install', 'vsce', 'ls'], {
    encoding: 'utf8',
    cwd: new URL('..', import.meta.url).pathname,
  })
  return out.split('\n').map((l) => l.trim()).filter((l) => l !== '')
}

test('the vendored template does not ship inside the extension', () => {
  const files = packagedFiles()
  const leaked = files.filter((f) => f.startsWith('.code-server'))
  assert.deepEqual(leaked, [], `these should not be in the package:\n${leaked.join('\n')}`)
})

test('sources and build configuration do not ship', () => {
  const files = packagedFiles()
  const leaked = files.filter(
    (f) => f.startsWith('src/') || f.startsWith('tools/') || f === 'tsconfig.json',
  )
  assert.deepEqual(leaked, [], `these should not be in the package:\n${leaked.join('\n')}`)
})

test('the bundle does ship, because nothing works without it', () => {
  assert.ok(packagedFiles().includes('dist/extension.cjs'), 'the bundle is missing')
})
