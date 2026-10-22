import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Which Gradle the editor imports a build with when the build has no wrapper.
 *
 * **Why this exists** (#183, measured in kotodori on 2026-10-21). jdtls finds
 * every directory carrying a settings file and imports it as a build of its
 * own, and redhat.java's Buildship does that with the build's wrapper when it
 * has one and with the Gradle its tooling API bundles — 9.7.1 in 1.58 and 1.59
 * — when it does not. An included build such as `build-logic` has no wrapper,
 * because the builds that include it carry one; so the editor ran 9.7.1 in a
 * directory the project's 8.14.3 also writes, and each rebuilt the other's
 * kotlin-dsl accessors out from under it. The builds failed intermittently,
 * naming a missing `PluginSpecBuilders.kt` and not the second Gradle.
 *
 * `java.import.gradle.version` is what both Buildship and the Build Server fall
 * back to where a build has no wrapper; where it has one, the wrapper still
 * wins. So setting it to the version every wrapper names changes nothing but
 * the wrapperless builds.
 */
export const IMPORT_SETTING = 'java.import.gradle.version'

export interface GradleBuild {
  /** Relative to the project root, `/`-separated; `.` for the root itself. */
  dir: string
  /** `gradle/wrapper/gradle-wrapper.properties`, or null when there is none. */
  wrapper: string | null
}

export interface Scan {
  builds: GradleBuild[]
  log: string[]
}

/**
 * Not walked: what a dependency manager, a build or a tool put there. A
 * settings file under `node_modules` is somebody else's build, and walking
 * `build/` or `.git/` on every open is the cost this bound exists to refuse.
 */
const SKIPPED = new Set(['.git', '.gradle', '.kotlin', '.idea', 'build', 'node_modules', 'target', 'dist', 'out'])

const SETTINGS = ['settings.gradle', 'settings.gradle.kts']
const BUILD_FILES = ['build.gradle', 'build.gradle.kts']
const WRAPPER = join('gradle', 'wrapper', 'gradle-wrapper.properties')

/**
 * The Gradle builds in a project, sorted by directory.
 *
 * **Bounded, because it runs on every open.** Depth and a directory budget,
 * no symlinks followed — a loop would otherwise never end, and an alias would
 * report one build twice. Hitting either bound is said in the log rather than
 * silently returning less: a build past the bound gets no protection, and the
 * person wondering why should find the reason.
 *
 * **Sorted, because the result reaches a hashed file.** The tooling identifies
 * a container by a hash of its configuration, and a scan whose output followed
 * the order the filesystem happened to list would recreate the container on an
 * open that changed nothing.
 */
export function findGradleBuilds(
  root: string,
  bounds: { maxDepth?: number; maxDirectories?: number } = {},
): Scan {
  const maxDepth = bounds.maxDepth ?? 8
  const maxDirectories = bounds.maxDirectories ?? 5000
  const builds: GradleBuild[] = []
  const log: string[] = []
  let visited = 0
  let depthHit = false

  const walk = (rel: string, depth: number, insideBuild: boolean): boolean => {
    if (visited >= maxDirectories) return false
    visited++

    const abs = rel === '.' ? root : join(root, rel)
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      return true
    }
    const files = new Set(entries.filter((e) => e.isFile()).map((e) => e.name))

    // A settings file starts a build. A build file with no settings and no
    // build above it is a single-project build; under one, it is a subproject.
    const isBuild =
      SETTINGS.some((f) => files.has(f)) || (!insideBuild && BUILD_FILES.some((f) => files.has(f)))
    if (isBuild) builds.push({ dir: rel, wrapper: readOrNull(join(abs, WRAPPER)) })

    // `isDirectory()` is false for a symlink, which is what keeps loops out.
    const dirs = entries
      .filter((e) => e.isDirectory() && !SKIPPED.has(e.name))
      .map((e) => e.name)
      .sort()
    for (const name of dirs) {
      if (depth + 1 > maxDepth) {
        depthHit = true
        continue
      }
      const child = rel === '.' ? name : `${rel}/${name}`
      if (!walk(child, depth + 1, insideBuild || isBuild)) return false
    }
    return true
  }

  if (!isDirectory(root)) return { builds, log }
  if (!walk('.', 0, false)) {
    log.push(
      `gradle: stopped looking for builds after ${maxDirectories} directories (the scan's budget); ` +
        `a build further in is imported with whatever Gradle the editor bundles`,
    )
  }
  if (depthHit) {
    log.push(
      `gradle: did not look deeper than ${maxDepth} directories (the scan's depth); ` +
        `a build further in is imported with whatever Gradle the editor bundles`,
    )
  }
  builds.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0))
  return { builds, log }
}

export interface GradleVersion {
  /** What to set `java.import.gradle.version` to, or null to set nothing. */
  version: string | null
  /** For a person: shown as a notification. */
  warnings: string[]
  /** For the output channel. */
  log: string[]
}

/**
 * The version the editor should import wrapperless builds with, if there is
 * exactly one honest answer.
 *
 * **Nothing when no build lacks a wrapper.** The setting would change nothing
 * the editor does, and it would change the configuration's hash for every
 * Gradle project on its next open — recreating containers for no reason.
 *
 * **Nothing when the wrappers disagree, or one cannot be read.** Picking one
 * of two versions puts the other's builds back where #183 found them, and
 * silently. A warning that names each wrapper is the only answer that does not
 * guess; the fix it points at — a wrapper in the wrapperless build — is the
 * project's to make.
 */
export function gradleVersion(builds: GradleBuild[]): GradleVersion {
  const sorted = [...builds].sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0))
  const bare = sorted.filter((b) => b.wrapper === null).map((b) => b.dir)
  const log: string[] = []
  if (bare.length === 0) return { version: null, warnings: [], log }

  const versions = new Map<string, string>()
  const unreadable: string[] = []
  for (const b of sorted) {
    if (b.wrapper === null) continue
    const v = wrapperVersion(b.wrapper)
    if (v === null) {
      unreadable.push(b.dir)
      log.push(`gradle: could not read a release version from ${b.dir}/gradle/wrapper/gradle-wrapper.properties's distributionUrl`)
    } else {
      versions.set(b.dir, v)
    }
  }

  const list = bare.map((d) => `\`${d}\``).join(', ')
  const fix = `Give each of them a wrapper of its own (\`gradle wrapper\` in that directory), or the editor imports it with the Gradle it bundles, which can corrupt a build the project's wrapper also writes.`

  if (unreadable.length > 0) {
    return {
      version: null,
      log,
      warnings: [
        `Gradle builds with no wrapper (${list}) are imported by the editor with the Gradle it bundles, because the version of ` +
          unreadable.map((d) => `\`${d}\``).join(', ') +
          `'s wrapper could not be read. ${fix}`,
      ],
    }
  }

  const distinct = [...new Set(versions.values())]
  if (distinct.length === 0) {
    return {
      version: null,
      log,
      warnings: [`Gradle builds in this project (${list}) have no Gradle wrapper, so the editor imports them with the Gradle it bundles. ${fix}`],
    }
  }
  if (distinct.length > 1) {
    const named = [...versions].map(([d, v]) => `\`${d}\` ${v}`).join(', ')
    return {
      version: null,
      log,
      warnings: [
        `Gradle builds with no wrapper (${list}) are imported by the editor with the Gradle it bundles, because the project's wrappers disagree (${named}) and no one version is right for all of them. ${fix}`,
      ],
    }
  }

  const [version = null] = distinct
  log.push(`gradle: ${bare.join(', ')} has no wrapper; the editor imports it with ${version}, the version every wrapper names (${IMPORT_SETTING})`)
  return { version, warnings: [], log }
}

/**
 * The release a wrapper names, from the distribution file's name — which is
 * also what a mirror keeps. Only release and release-candidate versions: a
 * snapshot or a renamed archive is not a version the editor can be told to use.
 */
export function wrapperVersion(properties: string): string | null {
  const line = properties.split('\n').find((l) => l.trimStart().startsWith('distributionUrl'))
  if (line === undefined) return null
  const url = line.slice(line.indexOf('=') + 1).trim().replace(/\\(.)/g, '$1')
  const match = /\/gradle-(\d+(?:\.\d+)+(?:-(?:rc|milestone)-\d+)?)-(?:bin|all)\.zip$/.exec(url)
  return match?.[1] ?? null
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
