/**
 * The project manifest's name, and which of the two a project actually has.
 *
 * **Not `src/manifest.ts`, deliberately.** `src/manifest.test.ts` is about
 * `package.json` — the *extension's* manifest — and two things called the
 * manifest in one directory is how somebody edits the wrong one. The name here
 * matches `STACK_MANIFEST`, which is what `core/compose-dockerfile.sh` already
 * calls the file it is handed.
 *
 * **A leaf on purpose.** It imports nothing, so every module that needs the name
 * can have it without taking a dependency graph with it: `build.ts` imports only
 * `template.ts`, and reaching the name through `open.ts` — where `CONFIG_PATH`
 * lives — would have pulled four modules in behind it.
 *
 * `scripts/manifest-name-is-defined-once.test.sh` holds the name to one
 * definition: here, and in `package.json`'s activation events, which are data
 * read before any of this code runs and therefore cannot be a variable. Those
 * two copies exist by necessity; a third is how a rename leaves one behind.
 */

/** What a project's manifest is called. */
export const MANIFEST = '.agent-container.stack.json'

/**
 * What it was called while the template was `jvsl.env.agents.code-server`, which
 * is archived and absorbed.
 *
 * **Removed in 2.0.0.** Until then a project carrying it is adopted rather than
 * ignored — a name that matches nothing does not fail, it simply never wakes the
 * extension, and nothing can report what never ran.
 */
export const LEGACY_MANIFEST = '.code-server.stack.json'

/** What is at each name, or null where there is no file. */
export interface ManifestOnDisk {
  current: string | null
  legacy: string | null
}

export type ManifestResolution =
  | { action: 'use-current' }
  | { action: 'adopt'; contents: string; note: string }
  | { action: 'keep-both'; note: string }
  | { action: 'leave-unreadable'; note: string }
  | { action: 'none' }

/** Whether this is a manifest rather than merely valid JSON. */
function parsesAsManifest(contents: string): boolean {
  try {
    const parsed: unknown = JSON.parse(contents)
    // `null` and `[]` both parse. Neither is a manifest, and renaming a file
    // whose contents this extension cannot use is the thing FR-113 refuses.
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

/**
 * Which name this project has, and what to do about it.
 *
 * **Pure, and the caller does every dangerous part.** Writing the new file,
 * reading it back to compare, and only then unlinking the old one is the order
 * the task's first failure scenario requires: a half-completed rename can leave
 * a project with neither name, and the extension then does not wake for it — so
 * the damage and the inability to report it would arrive together.
 */
export function resolveManifest(disk: ManifestOnDisk): ManifestResolution {
  if (disk.current !== null && disk.legacy !== null) {
    return {
      action: 'keep-both',
      note:
        `this project has both \`${MANIFEST}\` and \`${LEGACY_MANIFEST}\`. The first is being ` +
        `used and the second was left exactly as it is: two manifests disagreeing is a situation ` +
        `to settle rather than one to guess at, and nothing here merges or deletes either.`,
    }
  }

  if (disk.current !== null) return { action: 'use-current' }

  if (disk.legacy !== null) {
    if (!parsesAsManifest(disk.legacy)) {
      return {
        action: 'leave-unreadable',
        note:
          `\`${LEGACY_MANIFEST}\` could not be read as a manifest, so nothing was renamed and ` +
          `nothing was deleted. Fix it, or rename it to \`${MANIFEST}\` yourself.`,
      }
    }
    return {
      action: 'adopt',
      contents: disk.legacy,
      note:
        `\`${LEGACY_MANIFEST}\` was renamed to \`${MANIFEST}\`, with its contents unchanged. The ` +
        `old name is this extension's own, from when it shipped as a template called ` +
        `code-server; support for it is removed in 2.0.0.`,
    }
  }

  return { action: 'none' }
}
