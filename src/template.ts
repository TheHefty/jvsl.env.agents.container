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
