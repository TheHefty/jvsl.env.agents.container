/**
 * The project manifest's name, and which of the two a project actually has.
 *
 * **Not `src/manifest.ts`, deliberately.** `src/manifest.test.ts` is about
 * `package.json` — the *extension's* manifest — and two things called the
 * manifest in one directory is how somebody edits the wrong one. The name here
 * matches `STACK_MANIFEST`, which is what the composer (`src/build/compose.ts`) already
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
