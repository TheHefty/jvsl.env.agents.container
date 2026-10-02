import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Version {
  major: number
  minor: number
  patch: number
}

/**
 * A three-part version, or null for anything this cannot make sense of.
 *
 * Null rather than a zeroed version on purpose: a zeroed one compares as older
 * than everything, so an unreadable file would be reported as an out-of-date
 * template — a cause that is not the cause. Whatever reads this has to say
 * "could not be read" in its own words.
 *
 * Trimmed because the file it reads is written by release-please and ends in a
 * newline, and "2.2.0\n" is unequal to every version there is.
 */
export function parseVersion(raw: string): Version | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

/**
 * The template version a project is pinned to, or null when it cannot be read.
 *
 * Absent is the normal case and not an error: a clone without `--recursive`
 * leaves `.code-server/` existing and empty, which is exactly why activation
 * keys off the manifest at the project root instead of anything in here.
 */
export function readTemplateVersion(projectRoot: string): string | null {
  try {
    const raw = readFileSync(join(projectRoot, '.code-server', 'version.txt'), 'utf8').trim()
    return raw === '' ? null : raw
  } catch {
    return null
  }
}

/**
 * Whether `found` is at least `minimum`, both as `major.minor.patch`.
 *
 * **It exists because this file had no ordering at all**, and the number it
 * orders is what decides whether a project opens. The two implementations a
 * reader reaches for first are both wrong on versions this project will
 * actually have: a string compare puts `4.9.0` before `5.0.0` by luck and
 * `10.0.0` before `9.0.0` by rule, and a numeric compare of the major alone
 * misses `5.0.10` against `5.0.9`.
 *
 * **Anything unparseable is never at least anything**, including the minimum.
 * That follows `parseVersion` returning null rather than a zeroed version, for
 * the reason written beside it: a zeroed one compares as older and hides the
 * difference between "old" and "unreadable", which have different fixes.
 */
export function isAtLeast(found: string, minimum: string): boolean {
  const a = parseVersion(found)
  const b = parseVersion(minimum)
  if (a === null || b === null) return false
  if (a.major !== b.major) return a.major > b.major
  if (a.minor !== b.minor) return a.minor > b.minor
  return a.patch >= b.patch
}
