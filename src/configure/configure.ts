/**
 * What a run of the questions did, and whether anything should follow it.
 *
 * **`configure` returned `void` until this.** A caller could not tell "the
 * person answered and a manifest was written" from "the person pressed Escape
 * at question three", and the two have to lead to different places: one carries
 * on into a build, and the other stops because somebody decided not to.
 *
 * Kept as a function over a result rather than as an `if` at the call site, for
 * the reason `handsOver` is: the call site is the part no test can reach.
 */
export interface ConfigureResult {
  /** False for any cancellation. Nothing partial is ever written. */
  wrote: boolean
  /**
   * The folder the questions were about.
   *
   * **It is reported so it can be asserted**, because this is the value whose
   * being wrong costs the most: the questions write
   * `.code-server.stack.json`, which is tracked and is the only record of what
   * a project selected, so asking about the workspace instead of the folder
   * somebody chose rewrites it in a repository nobody asked about.
   */
  root: string
  stacks: string[]
}

export interface ConfigureOutcome {
  proceed: boolean
  message: string
}

export function configureOutcome(result: ConfigureResult): ConfigureOutcome {
  if (!result.wrote) {
    return {
      proceed: false,
      message:
        `the questions were cancelled for ${result.root}, so nothing was written and nothing ` +
        `was built.`,
    }
  }
  const listed = result.stacks.length > 0 ? result.stacks.join(', ') : 'no stacks'
  return {
    proceed: true,
    message: `wrote the manifest for ${result.root}: ${listed}.`,
  }
}
