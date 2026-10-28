/**
 * Appending an attempt (story the-study-view). Pure: the panel reads the file,
 * this decides the new text, the panel writes it.
 *
 * **An attempt is never lost**: every earlier one is kept, and an attempts.json
 * that does not parse or does not follow the contract is not rewritten — the
 * panel says so instead, because rewriting it would drop whatever it held.
 */
import { validate, withAttemptsIgnored, type Schemas } from './contract.ts'

export type Appended = { ok: true; text: string } | { ok: false; why: string }

export function appendAttempt(current: string | null, id: string, text: string, at: string, itemIds: readonly string[], schemas?: Schemas): Appended {
  if (text.trim() === '') return { ok: false, why: 'An attempt cannot be empty: write what you think, even a guess.' }
  if (!itemIds.includes(id)) return { ok: false, why: `"${id}" is not an item of this topic's practice.` }
  let attempts: Record<string, { at: string; text: string }[]> = {}
  if (current !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(current)
    } catch (error) {
      return { ok: false, why: `attempts.json is not valid JSON (${String(error)}), so it was not rewritten. Fix or move it, then try again.` }
    }
    const shapeOk = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    const errors = schemas !== undefined && shapeOk ? validate(schemas.attempts, parsed) : []
    const looseOk = shapeOk && Object.values(parsed as object).every((v) => Array.isArray(v) &&
      v.every((a: unknown) => a !== null && typeof a === 'object' && typeof (a as { at?: unknown }).at === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test((a as { at: string }).at) && typeof (a as { text?: unknown }).text === 'string'))
    if (!shapeOk || errors.length > 0 || !looseOk) {
      return { ok: false, why: 'attempts.json does not follow the contract, so it was not rewritten. Fix or move it, then try again.' }
    }
    attempts = parsed as typeof attempts
  }
  const next = { ...attempts, [id]: [...(attempts[id] ?? []), { at, text }] }
  return { ok: true, text: `${JSON.stringify(next, null, 2)}\n` }
}

/** Now, as the developer's clock reads it, with the offset: 2026-10-28T22:00:00-03:00. */
export function localTimestamp(date: Date = new Date(), offsetMinutes: number = -date.getTimezoneOffset()): string {
  const local = new Date(date.getTime() + offsetMinutes * 60_000)
  const sign = offsetMinutes < 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${local.toISOString().slice(0, 19)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/**
 * Saves an attempt into a topic's attempts.json through the project's files.
 * **The .gitignore line goes first**: an attempt written before it would be one
 * `git add .` away from a repository that may be public. A write that fails is
 * returned, with its reason, and nothing is written after it.
 */
export function saveAttempt(
  files: import('../host/files.ts').ProjectFiles,
  slug: string,
  itemIds: readonly string[],
  id: string,
  text: string,
  at: string,
  schemas?: Schemas,
): Appended {
  const ignore = 'docs/study/.gitignore'
  const target = `docs/study/${slug}/attempts.json`
  try {
    const before = files.read(ignore)
    const after = withAttemptsIgnored(before)
    if (after !== before) files.write(ignore, after)
    const next = appendAttempt(files.read(target), id, text, at, itemIds, schemas)
    if (!next.ok) return next
    files.write(target, next.text)
    return next
  } catch (error) {
    return { ok: false, why: `The attempt was not saved: ${error instanceof Error ? error.message : String(error)}` }
  }
}
