/**
 * The project manifest's name, in one place.
 *
 * **Not `src/manifest.ts`, deliberately.** `src/manifest.test.ts` is about
 * `package.json` — the *extension's* manifest — and two things called the
 * manifest in one directory is how somebody edits the wrong one. The name here
 * matches `STACK_MANIFEST`, which is what `core/compose-dockerfile.sh` already
 * calls the file it is handed.
 *
 * **A leaf on purpose.** It imports nothing, so every module that needs the name
 * can have it without taking a dependency graph with it: `build.ts` imports only
 * `template.ts` today, and reaching the name through `open.ts` — where
 * `CONFIG_PATH` lives — would have pulled four modules in behind it.
 *
 * `scripts/manifest-name-is-defined-once.test.sh` holds this true: the name is
 * written out here and in `package.json`'s activation event, which is data read
 * before any of this code runs and therefore cannot be a variable. Those two
 * copies exist by necessity; a third is how a rename leaves one behind.
 */
export const MANIFEST = '.code-server.stack.json'
