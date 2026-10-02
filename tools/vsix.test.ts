import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * What ships, and more to the point what does not.
 *
 * Packaged without a .vscodeignore this extension came to 157 files and 334 KB
 * around a 5 KB bundle, the bulk of it the vendored template submodule — a
 * separate product, with its own releases and its own licence, inside an editor
 * extension. Nothing failed; the package was simply twenty times larger than it
 * had any reason to be, and shipped somebody else's source.
 */
/**
 * **The one place that decides what a test file is.**
 *
 * Two assertions below face opposite directions — one says what may ship, the
 * other what must — and if they disagreed about this, a file would be
 * simultaneously required and forbidden. The cheapest way out of that deadlock
 * is editing whichever one is complaining until it stops, which is how the
 * pair stops meaning anything. They both call this.
 */
function isTest(path: string): boolean {
  return path.endsWith('.test.sh')
}

/** Everything git tracks under a directory, which is the tree's own answer. */
function trackedUnder(dir: string): string[] {
  const out = execFileSync('git', ['ls-files', dir], {
    encoding: 'utf8',
    cwd: new URL('..', import.meta.url).pathname,
  })
  return out.split('\n').map((l) => l.trim()).filter((l) => l !== '')
}

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
    // The image's content. The extension composes a project's Dockerfile from
    // these, which is what lets a project need nothing but the extension
    // installed. Their own `*.test.sh` are excluded in .vscodeignore and the
    // assertion below holds that true.
    /^core\//,
    /^stacks\//,
  ]
  const unexpected = packagedFiles().filter((f) => !allowed.some((p) => p.test(f)))
  assert.deepEqual(
    unexpected,
    [],
    `${unexpected.length} file(s) ship that nothing asked to ship. Either add them to the ` +
      `allowed list above with a reason, or exclude them in .vscodeignore:\n${unexpected.join('\n')}`,
  )
})

/**
 * The converse of the allowlist, and the failure it cannot see.
 *
 * If `.vscodeignore` were wrong in the other direction — `core/cont-init/**`
 * excluded by accident — the allowlist would be perfectly happy: nothing
 * unexpected shipped. The package would simply be missing four boot hooks, and
 * the first thing to notice would be a container starting with no
 * state-ownership repair, no git credential helper and no `ai-memory`, saying
 * nothing at all.
 *
 * The list of what must ship comes from git rather than from a list written
 * here, so a stack added to `stacks/` travels without anybody editing this
 * file — the same property `discover-stacks` gives the other side of the
 * boundary.
 */
test('every non-test file under core/ and stacks/ ships', () => {
  const shipped = new Set(packagedFiles())
  const required = [...trackedUnder('core'), ...trackedUnder('stacks')].filter((f) => !isTest(f))
  assert.ok(required.length > 50, `only ${required.length} files to require; this test is not reading the tree it thinks it is and would pass vacuously`)
  const missing = required.filter((f) => !shipped.has(f))
  assert.deepEqual(
    missing,
    [],
    `${missing.length} of ${required.length} file(s) the image is built from are not in the \
package:\n${missing.join('\n')}`,
  )
})

test('the tests and the guards do not ship', () => {
  const files = packagedFiles()
  const leaked = files.filter((f) => isTest(f) || f.startsWith('scripts/'))
  assert.deepEqual(
    leaked,
    [],
    `CI's own checks have no business inside an editor extension:\n${leaked.join('\n')}`,
  )
})

/**
 * A `.vsix` is a zip, and a zip can carry the Unix mode. Measured before this
 * was asserted: packaged with `core/cont-init/` included, the entries came back
 * `755` for what is `755` in the repository and `644` for what is `644`. So
 * this says it keeps being true rather than repairing anything.
 *
 * The image's build does not depend on it — `core/Dockerfile.frag` runs
 * `chmod +x` after every `COPY` of a hook or a service. What the bit matters
 * for is anything the **host** runs straight out of the package.
 */
test('a file that is executable in the repository is executable in the package', () => {
  const modes = execFileSync('git', ['ls-files', '-s', 'core', 'stacks'], {
    encoding: 'utf8',
    cwd: new URL('..', import.meta.url).pathname,
  })
  const executables = modes
    .split('\n')
    .filter((l) => l.startsWith('100755'))
    .map((l) => l.split('\t')[1])
    .filter((f): f is string => f !== undefined && !isTest(f))
  assert.ok(executables.length > 0, 'no executable files to check; this would pass vacuously')

  // **It builds the artifact it inspects**, rather than reading one that
  // happens to be on disk. The first version read
  // `jvsl-env-agents-vscode.vsix` from the working directory and passed
  // locally for the wrong reason — a stale package left over from an earlier
  // run. Had `.vscodeignore` changed without a repackage, it would have
  // asserted about the old one and said nothing. In CI it failed loudly
  // instead, because this test runs before the packaging step, and the loud
  // failure is the better of the two outcomes.
  const out = join(mkdtempSync(join(tmpdir(), 'vsix-')), 'probe.vsix')
  execFileSync('npx', ['--no-install', 'vsce', 'package', '--no-dependencies', '--out', out], {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'ignore',
  })

  // `unzip -Z` rather than a library: no dependency to add, and no branch that
  // skips the check when something is unavailable. A test that returns early
  // when its tool is missing is a test that reports success for having done
  // nothing, which is the failure this file exists to catch in the package.
  const listing = execFileSync('unzip', ['-Z', out], { encoding: 'utf8' })
  const executableInZip = new Set(
    listing
      .split('\n')
      .filter((l) => /^-rwx/.test(l))
      .map((l) => l.trim().split(/\s+/).pop())
      .filter((f): f is string => f !== undefined && f.startsWith('extension/'))
      .map((f) => f.slice('extension/'.length)),
  )
  const lost = executables.filter((f) => !executableInZip.has(f))
  assert.deepEqual(
    lost,
    [],
    `these lose their executable bit in the package:\n${lost.join('\n')}`,
  )
})
