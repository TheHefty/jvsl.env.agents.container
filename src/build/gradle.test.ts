import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { findGradleBuilds, gradleVersion, type GradleBuild } from './gradle.ts'

const wrapper = (version: string): string =>
  `distributionBase=GRADLE_USER_HOME\n` +
  `distributionUrl=https\\://services.gradle.org/distributions/gradle-${version}-bin.zip\n`

// kotodori on 2026-10-21: two services on the 8.14.3 wrapper, and the included
// build they share with no wrapper of its own — which the editor's Buildship
// imported with its bundled 9.7.1.
const kotodori: GradleBuild[] = [
  { dir: '2-backend/build-logic', wrapper: null },
  { dir: '2-backend/core', wrapper: wrapper('8.14.3') },
  { dir: '2-backend/iam', wrapper: wrapper('8.14.3') },
]

// Measured in kotodori on 2026-10-29 (debt rjj): with java.import.gradle.version
// at 8.14.3, jdt.ls's main connection used it, but a second jdt.ls connection
// opened build-logic with redhat.java's bundled 9.7.1 and vscode-gradle's
// server with its bundled 9.8.1, and the next 8.14.3 import of core failed on
// what they left in build-logic/build. No editor setting held either one.

test('a wrapperless build still sets the version every wrapper names, for the clients that read it', () => {
  const result = gradleVersion(kotodori)
  assert.equal(result.version, '8.14.3')
})

test('and is warned about, naming each wrapperless build and the wrapper that fixes it', () => {
  const result = gradleVersion(kotodori)
  assert.equal(result.warnings.length, 1)
  const w = result.warnings[0] ?? ''
  assert.ok(w.includes('`2-backend/build-logic`'), w)
  assert.ok(w.includes('gradle wrapper --gradle-version 8.14.3'), w)
  assert.match(w, /whatever `java\.import\.gradle\.version` says/)
})

test('the log no longer claims the editor imports it with that version', () => {
  const result = gradleVersion(kotodori)
  assert.ok(!result.log.some((l) => /the editor imports it with/.test(l)), result.log.join('\n'))
  assert.ok(result.log.some((l) => l.includes('2-backend/build-logic') && l.includes('ignore')), result.log.join('\n'))
})

test('nothing is set when every build has its own wrapper, so the configuration does not change', () => {
  const result = gradleVersion([
    { dir: 'a', wrapper: wrapper('8.14.3') },
    { dir: 'b', wrapper: wrapper('9.1.0') },
  ])
  assert.equal(result.version, null)
  assert.deepEqual(result.warnings, [])
})

test('diverging wrappers set nothing and the warning names each of them', () => {
  const result = gradleVersion([
    { dir: 'build-logic', wrapper: null },
    { dir: 'core', wrapper: wrapper('8.14.3') },
    { dir: 'iam', wrapper: wrapper('9.1.0') },
  ])
  assert.equal(result.version, null)
  assert.equal(result.warnings.length, 1)
  for (const part of ['build-logic', 'core', '8.14.3', 'iam', '9.1.0']) {
    assert.ok(result.warnings[0]?.includes(part), `${part} missing: ${result.warnings[0]}`)
  }
})

test('a wrapperless build with no wrapper anywhere is warned about, not guessed', () => {
  const result = gradleVersion([{ dir: '.', wrapper: null }])
  assert.equal(result.version, null)
  assert.equal(result.warnings.length, 1)
  assert.ok(result.warnings[0]?.includes('no Gradle wrapper'), result.warnings[0])
})

test('a distributionUrl that cannot be read sets nothing, says which, and does not throw', () => {
  for (const text of [
    'distributionUrl=https\\://mirror.example/gradle-dist.zip\n',
    'distributionUrl=https\\://services.gradle.org/distributions-snapshots/gradle-9.2-20260101000000+0000-bin.zip\n',
    'not a properties file at all',
  ]) {
    const result = gradleVersion([
      { dir: 'build-logic', wrapper: null },
      { dir: 'core', wrapper: wrapper('8.14.3') },
      { dir: 'odd', wrapper: text },
    ])
    assert.equal(result.version, null, text)
    assert.ok(result.log.some((l) => l.includes('odd')), result.log.join('\n'))
    assert.equal(result.warnings.length, 1, text)
  }
})

test('release candidates and -all distributions are read', () => {
  const rc = 'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.0-rc-1-all.zip\n'
  assert.equal(gradleVersion([{ dir: 'x', wrapper: null }, { dir: 'y', wrapper: rc }]).version, '9.0-rc-1')
})

test('the answer does not depend on the order the builds were found in', () => {
  // Order reaches the warning text and the log, and the log line reaches the
  // output only — but the version reaches a hashed file, and a message that
  // changed between identical opens would be the first sign it does too.
  const builds: GradleBuild[] = [
    { dir: 'a-logic', wrapper: null },
    { dir: 'b-core', wrapper: wrapper('8.14.3') },
    { dir: 'c-logic', wrapper: null },
    { dir: 'd-iam', wrapper: wrapper('9.1.0') },
  ]
  const reversed = [...builds].reverse()
  assert.deepEqual(gradleVersion(reversed), gradleVersion(builds))
  const agreeing = builds.map((b) => (b.wrapper === null ? b : { ...b, wrapper: wrapper('8.14.3') }))
  assert.deepEqual(gradleVersion([...agreeing].reverse()), gradleVersion(agreeing))
})

// --- the scanner, against a real tree ---

const tree = (): string => mkdtempSync(join(tmpdir(), 'gradle-scan-'))
const put = (root: string, path: string, contents = ''): void => {
  const full = join(root, path)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, contents)
}

test('the scanner finds the builds kotodori has, sorted, with their wrappers', () => {
  const root = tree()
  put(root, '2-backend/iam/settings.gradle.kts')
  put(root, '2-backend/iam/gradle/wrapper/gradle-wrapper.properties', wrapper('8.14.3'))
  put(root, '2-backend/core/settings.gradle.kts')
  put(root, '2-backend/core/gradle/wrapper/gradle-wrapper.properties', wrapper('8.14.3'))
  put(root, '2-backend/build-logic/settings.gradle.kts')
  // A subproject of core is part of core's build, not a build of its own.
  put(root, '2-backend/core/app/build.gradle.kts')

  const builds = findGradleBuilds(root).builds
  assert.deepEqual(builds.map((b) => b.dir), ['2-backend/build-logic', '2-backend/core', '2-backend/iam'])
  assert.equal(builds[0]?.wrapper, null)
  assert.ok(builds[1]?.wrapper?.includes('8.14.3'))
})

test('a single-project build with no settings file is still a build', () => {
  const root = tree()
  put(root, 'build.gradle')
  assert.deepEqual(findGradleBuilds(root).builds.map((b) => b.dir), ['.'])
})

test('the scanner does not walk into dependencies, output or state', () => {
  const root = tree()
  for (const skipped of ['node_modules/pkg', 'build/tmp', '.gradle/x', '.git/x', '.kotlin/x']) {
    put(root, `${skipped}/settings.gradle.kts`)
  }
  assert.deepEqual(findGradleBuilds(root).builds, [])
})

test('a symlink loop does not hang the scan, and symlinks are not followed', () => {
  const root = tree()
  put(root, 'real/settings.gradle')
  symlinkSync(root, join(root, 'loop'))
  symlinkSync(join(root, 'real'), join(root, 'alias'))
  assert.deepEqual(findGradleBuilds(root).builds.map((b) => b.dir), ['real'])
})

test('the scan stops at its depth bound and says so', () => {
  const root = tree()
  const deep = Array.from({ length: 12 }, (_, i) => `d${i}`).join('/')
  put(root, `${deep}/settings.gradle`)
  const scan = findGradleBuilds(root)
  assert.deepEqual(scan.builds, [])
  assert.ok(scan.log.some((l) => l.includes('depth')), scan.log.join('\n'))
})

test('the scan stops at its directory budget and says so', () => {
  const root = tree()
  for (let i = 0; i < 60; i++) mkdirSync(join(root, `dir${i}`))
  const scan = findGradleBuilds(root, { maxDirectories: 10 })
  assert.ok(scan.log.some((l) => l.includes('budget')), scan.log.join('\n'))
})

test('a project root that cannot be read yields no builds rather than an exception', () => {
  assert.deepEqual(findGradleBuilds('/nonexistent/for/sure').builds, [])
})

// --- a WSL project's builds, found by the distro (debt a-running-distro-is-reported-as-not-answering)

import { buildsFromListing, GRADLE_FIND } from './gradle.ts'

test('the distro lists the files that make builds, and the same builds come out as from a walk', () => {
  const listing = [
    './2-backend/iam/settings.gradle.kts',
    './2-backend/iam/gradle/wrapper/gradle-wrapper.properties',
    './2-backend/core/settings.gradle.kts',
    './2-backend/core/app/build.gradle.kts',
    './2-backend/core/gradle/wrapper/gradle-wrapper.properties',
    './2-backend/build-logic/settings.gradle.kts',
  ].join('\n')
  const read = (rel: string) => (listing.includes(`./${rel}`) ? wrapper('8.14.3') : null)
  const builds = buildsFromListing(listing, read)
  assert.deepEqual(builds.map((b) => b.dir), ['2-backend/build-logic', '2-backend/core', '2-backend/iam'])
  assert.equal(builds[0]?.wrapper, null)
  assert.ok(builds[1]?.wrapper?.includes('8.14.3'))
})

test('a single-project build at the root is still a build, and a subproject is not', () => {
  assert.deepEqual(buildsFromListing('./build.gradle\n./sub/build.gradle\n', () => null).map((b) => b.dir), ['.'])
})

test('the distro\'s search is bounded, prunes what the walk skips, and follows no symlink', () => {
  assert.match(GRADLE_FIND, /-maxdepth \d+/)
  for (const skipped of ['.git', 'node_modules', 'build', '.gradle', '.kotlin']) assert.ok(GRADLE_FIND.includes(`-name ${skipped}`), skipped)
  assert.ok(!GRADLE_FIND.includes(' -L') && !GRADLE_FIND.includes('-follow'))
  assert.match(GRADLE_FIND, /head -n \d+/)
})

// --- an agent's worktree is not a build of the project (debt rjj, task rjj.3)
//
// Found in kotodori on 2026-10-29: a Claude Code worktree under .claude/worktrees/
// carries a copy of every build, build-logic's included, so a scan that walks
// into it names the copy in the warning and counts its wrapper in the version.

import { execFileSync } from 'node:child_process'

const withWorktree = (): string => {
  const root = tree()
  put(root, '2-backend/build-logic/settings.gradle.kts')
  put(root, '.claude/worktrees/some-task/2-backend/build-logic/settings.gradle.kts')
  put(root, '.claude/worktrees/some-task/2-backend/core/settings.gradle.kts')
  return root
}

test('the walk does not go into .claude, where an agent keeps its worktrees', () => {
  assert.deepEqual(findGradleBuilds(withWorktree()).builds.map((b) => b.dir), ['2-backend/build-logic'])
})

test("the distro's find does not either", () => {
  const listing = execFileSync('sh', ['-c', GRADLE_FIND, 'sh', withWorktree()], { encoding: 'utf8' })
  assert.deepEqual(listing.trim().split('\n'), ['./2-backend/build-logic/settings.gradle.kts'])
})
