
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
 * thing that differs. `src/build/template.test.ts` pins the expression and
 * `tools/vsix.test.ts` reads the artifact; neither alone is the claim.
 */
export function carried(extensionPath: string, ...parts: string[]): string {
  return [extensionPath, ...parts].join('/')
}
