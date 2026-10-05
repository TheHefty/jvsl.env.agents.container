/**
 * The copy of this extension that a rename left behind.
 *
 * **A rename changes an extension's identity, and the editor has no notion that
 * one supersedes another.** Installing the current one leaves the older
 * installed beside it, contributing palette entries whose titles still read
 * correctly and whose commands no longer exist — so following one produces
 * `command 'jvsl.devContainer.build' not found`, which names an id rather than
 * an extension and gets nobody to "I have two of these installed".
 */

/**
 * What this extension was published as before the rename.
 *
 * **Inferred, and that is why it is used as a lookup key rather than as a
 * claim.** It comes from the release-please component name plus the publisher;
 * nothing read it off an installed extension. Asserted as a fact it would be a
 * notice telling somebody to remove something they may not have. Looked up in
 * what the editor reports, being wrong costs nothing: the lookup misses and
 * nothing is said.
 *
 * Removed when the older copy can be assumed gone — the same decision, and the
 * same kind of date, as `LEGACY_MANIFEST`.
 */
export const SUPERSEDED_EXTENSION = 'thehefty.jvsl-env-agents-vscode'

/**
 * What to say about an older copy, or nothing.
 *
 * Pure over the ids the editor reports, which is what makes it testable without
 * one. The caller fires the notification and does not wait for it: FR-115 says
 * this blocks nothing, and a sentence explicitly not worth blocking for must not
 * hold activation in the one population already having a bad time.
 */
export function olderCopyNotice(installed: readonly string[]): string | undefined {
  // Case-insensitively, because the editor treats ids that way and a notice
  // that missed over capitalisation would be a silence nobody could explain.
  const present = installed.some(
    (id) => id.toLowerCase() === SUPERSEDED_EXTENSION.toLowerCase(),
  )
  if (!present) return undefined

  return (
    `An older copy of this extension is still installed as \`${SUPERSEDED_EXTENSION}\`. A rename ` +
    `changed this extension's identity, so the new one did not replace it — and the old one still ` +
    `offers commands it can no longer run, under titles that look right. Remove it: ` +
    `code --uninstall-extension ${SUPERSEDED_EXTENSION}`
  )
}
