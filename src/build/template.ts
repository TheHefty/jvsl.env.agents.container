
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

/**
 * A path to something the extension carries, rather than something a project
 * has.
 *
 * **Nothing in this extension had this concept until the image's content
 * arrived.** Every path was workspace-relative, and the only access to
 * extension-owned data was `context.extension?.packageJSON` — metadata rather
 * than a file.
 *
 * The expression is the same in a checkout and in an installation, and that is
 * true by a coincidence of two decisions rather than by design: `core/` and
 * `stacks/` were merged in at their *original* paths rather than under a
 * prefix, because the names were free. So a repository root and an extension's
 * installation directory have the same shape, and `extensionPath` is the only
 * thing that differs. `src/template.test.ts` pins the expression and
 * `tools/vsix.test.ts` reads the artifact; neither alone is the claim.
 */
export function carried(extensionPath: string, ...parts: string[]): string {
  return [extensionPath, ...parts].join('/')
}
