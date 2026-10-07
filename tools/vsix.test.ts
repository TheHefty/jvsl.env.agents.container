import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
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
    // The assets a project receives. Required by the assertion below rather
    // than merely allowed here, which is the distinction AGENTS.md taught.
    /^assets\/project\//,
    /^dist\/extension\.cjs$/,
    // The image's content. The extension composes a project's Dockerfile from
    // these, which is what lets a project need nothing but the extension
    // installed. Their own `*.test.sh` are excluded in .vscodeignore and the
    // assertion below holds that true.
    /^core\//,
    /^stacks\//,
    // The documents the image carries at /opt/jvsl/docs/agent. They are
    // required, not just permitted, by the COPY-sources test at the end.
    /^docs\/agent\//,
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
  // `jvsl-env-agents-container.vsix` from the working directory and passed
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

/**
 * The other half of `carried()`.
 *
 * `src/template.test.ts` pins the expression; this reads the artifact. Neither
 * alone is the claim, because the claim is about two different filesystems:
 * a checkout, where `extensionPath` is the repository root, and an
 * installation, where it is wherever the editor extracted `extension/` to.
 *
 * The package is the only place the second one is visible from here, and even
 * then only by the `extension/` prefix the editor strips. The story's
 * `@manual` pass is what closes the rest.
 */
test('the package holds the composer where carried() looks for it', () => {
  const files = packagedFiles()
  for (const needed of ['core/compose-dockerfile.sh', 'core/Dockerfile.frag', 'core/versions.json']) {
    assert.ok(
      files.includes(needed),
      `${needed} is not in the package; carried() would resolve to a path that does not exist ` +
        `in an installed extension, and every test that computes it would still pass`,
    )
  }
})

/**
 * The assets a project gets, **required rather than permitted.**
 *
 * `AGENTS.md` taught this distinction the hard way. It sat untracked at this
 * repository's root, shipped in a local package because `vsce` packages the
 * working directory, and was absent from every CI build — and both states were
 * green, because the allowlist permits it and the completeness assertion covers
 * only `core/` and `stacks/`. A file that is in one person's package and nobody
 * else's is the shape of defect this file exists to catch.
 */
test('the project assets ship, and this repository\'s own instructions do not', () => {
  const files = packagedFiles()
  for (const asset of ['assets/project/CLAUDE.md', 'assets/project/AGENTS.md']) {
    assert.ok(files.includes(asset), `${asset} must ship: it is what a project gets`)
  }
  // The root CLAUDE.md is *this project's* own, importing MODES.md and
  // docs/RULES.md from paths that exist in no other tree. Shipping it would
  // hand a project two imports that resolve to nothing — and an import that
  // resolves to nothing says nothing.
  const mine = files.filter((f) => f === 'CLAUDE.md' || f === 'AGENTS.md')
  assert.deepEqual(mine, [], `this repository's own instructions must not ship:\n${mine.join('\n')}`)
})

/**
 * Every path a Dockerfile fragment copies from the build context ships.
 *
 * **The context of a real build is the installed extension, not this
 * checkout.** `core/Dockerfile.frag` has copied `docs/agent` since 0d3dd5f.
 * `.vscodeignore` excludes `docs/**`, so that path was never in the package.
 * CI builds the image from a checkout, where it exists, so every job was
 * green. A person building from the installed extension got a failed
 * `docker build`. The test above requires `core/` and `stacks/` by name, and
 * a list written by hand cannot see a third directory. This test reads the
 * list from the `COPY` lines themselves.
 */
test('every path a Dockerfile fragment copies from the context ships', () => {
  const shipped = new Set(packagedFiles())
  const fragments = trackedUnder('.').filter((f) => /(^|\/)Dockerfile\.frag$/.test(f))
  assert.ok(fragments.length > 5, `only ${fragments.length} fragments found; this test would pass vacuously`)
  const sources = new Set<string>()
  for (const fragment of fragments) {
    const text = readFileSync(new URL(`../${fragment}`, import.meta.url), 'utf8')
    for (const line of text.split('\n')) {
      const rest = /^\s*(?:COPY|ADD)\s+(.*)$/.exec(line)?.[1]
      if (rest === undefined || /--from=/.test(rest)) continue
      const args = rest.split(/\s+/).filter((a) => a !== '' && !a.startsWith('--'))
      for (const src of args.slice(0, -1)) sources.add(src.replace(/\/$/, ''))
    }
  }
  const missing: string[] = []
  for (const src of sources) {
    const tracked = trackedUnder(src).filter((f) => !isTest(f))
    if (tracked.length === 0) missing.push(`${src} (not tracked in git at all)`)
    for (const f of tracked) if (!shipped.has(f)) missing.push(`${f}  ← COPY ${src}`)
  }
  assert.deepEqual(
    missing,
    [],
    `the image copies these from the build context, which is the installed extension, and they are not in the package:\n${missing.join('\n')}`,
  )
})

/**
 * A project's work tracker never ships.
 *
 * **This repository has one since 2026-10-07**, and `vsce` packages the working
 * directory, not git's view of it: bd's own .gitignore does not keep its
 * database out. Before .vscodeignore excluded it, a local `npm run package`
 * would have carried twelve files of .beads/, the Dolt database among them,
 * inside the extension. CI never sees it, because a checkout has no database;
 * the allowlist above caught it on a developer's machine.
 */
test('the work tracker does not ship', () => {
  const tracker = packagedFiles().filter((f) => f === '.beads' || f.startsWith('.beads/') || f.startsWith('.beads.'))
  assert.deepEqual(tracker, [], `the project's tracker would ship inside the extension:\n${tracker.join('\n')}`)
})
