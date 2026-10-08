import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Every source file the extension ships, read from the whole of src/ rather
 * than from the reading test's own folder. Tests that scan the source for a
 * pattern (no `shellPath` terminal, no Workspace Trust key) used to list their
 * own directory, which stops seeing a file the moment it moves into a folder
 * and stays green (story the-commands-leave-the-hub).
 */
export const SRC = fileURLToPath(new URL('..', import.meta.url))

export function shippedSources(): { path: string; text: string }[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.startsWith('test-support'))
    .sort()
    .map((p) => ({ path: p, text: readFileSync(join(SRC, p), 'utf8') }))
}
