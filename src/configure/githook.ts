/**
 * The pre-commit hook a project receives (story
 * the-markdown-size-check-runs-on-every-commit-in-a-project, epic qws): it runs
 * check-md-size, which ships in the image, so the Markdown size rule holds in
 * every project without anybody remembering to wire it. Create writes it into a
 * new project and Configure into one that has none; the container points git at
 * `.githooks` when it boots (core/cont-init/47-git-hooks-path.sh).
 *
 * **A hook this extension did not write is never replaced.** It is tracked and
 * may run the project's own checks, and replacing it would turn them off with
 * nothing said — the same rule instructions.ts holds CLAUDE.md to. Ours is
 * recognised by a marker line, so it can be brought up to date.
 */
export const HOOK_PATH = '.githooks/pre-commit'

/** Its contents, in the extension's project assets. */
export const HOOK_ASSET = 'githooks-pre-commit'

/** The line that says the extension wrote the file: a shell comment, matched loosely. */
export const HOOK_MARKER = '# jvsl.env.agents.container: generated.'

export function isOurHook(contents: string): boolean {
  return contents.split('\n').some((line) => line.trim().startsWith(HOOK_MARKER))
}

export type HookWrite =
  | { action: 'write'; contents: string }
  | { action: 'keep'; because: string }

/** What to do about the hook, given what is at HOOK_PATH (null when nothing is) and the asset. */
export function hookWrite(existing: string | null, asset: string): HookWrite {
  if (existing !== null && !isOurHook(existing)) {
    return {
      action: 'keep',
      because:
        `${HOOK_PATH} is already there and this extension did not write it, so it is somebody's ` +
        `work and may run this project's own checks. Nothing was written. To have check-md-size run ` +
        `on every commit, add a line calling it to that hook.`,
    }
  }
  return { action: 'write', contents: asset }
}
