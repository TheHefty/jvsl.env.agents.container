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

/**
 * The three tests above name what must not ship. **A list of exclusions cannot
 * see a directory nobody thought of**, which is not hypothetical: merging the
 * image's content in took the package from 6 files to 108 — the whole of
 * `core/` and `stacks/`, and all thirteen CI guard scripts — and all three
 * passed, because none of them was about `core/`.
 *
 * So this one is the other way round: everything in the package must be
 * something this test was told to expect. A new directory at the repository
 * root fails it by existing, which is the point.
 *
 * `core/` and `stacks/` are expected to join this list in story 2, when the
 * extension actually composes from them. `scripts/` never does — those are CI
 * guards and have no business inside an editor extension.
 */
test('nothing ships that this test was not told to expect', () => {
  const allowed = [
    /^package\.json$/,
    /^README\.md$/,
    /^LICENSE$/,
    /^CHANGELOG\.md$/,
    /^AGENTS\.md$/,
    /^dist\/extension\.cjs$/,
  ]
  const unexpected = packagedFiles().filter((f) => !allowed.some((p) => p.test(f)))
  assert.deepEqual(
    unexpected,
    [],
    `${unexpected.length} file(s) ship that nothing asked to ship. Either add them to the ` +
      `allowed list above with a reason, or exclude them in .vscodeignore:\n${unexpected.join('\n')}`,
  )
})
