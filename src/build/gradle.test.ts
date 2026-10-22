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

test('a wrapperless build is imported with the version every wrapper names', () => {
  const result = gradleVersion(kotodori)
  assert.equal(result.version, '8.14.3')
  assert.deepEqual(result.warnings, [])
  assert.ok(result.log.some((l) => l.includes('2-backend/build-logic') && l.includes('8.14.3')), result.log.join('\n'))
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
