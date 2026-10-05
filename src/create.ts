import type { ScaffoldPlan } from './scaffold.ts'

/** What applying a plan actually managed to do. */
export interface Applied {
  written: string[]
  failed: string[]
}

export interface CreateInput {
  /** Absent when the questions were cancelled before a plan existed. */
  plan?: ScaffoldPlan
  /** Absent when nothing was attempted. */
  applied?: Applied
}

export interface CreateDecision {
  open: boolean
  message: string
}

/**
 * Whether a created project is opened, and what to say either way.
 *
 * **It exists so "does it open when nothing was written" is a test rather than
 * a manual check.** `showOpenDialog`, `openFolder` and `git` cannot be exercised
 * here, so the caller is thin and every condition that decides lives in this
 * function — the same split `decideOpen` and `decidePick` use.
 *
 * The handoff into the container needs nothing from here: a freshly scaffolded
 * project has a manifest and no image, and activation in the new window builds
 * it and attaches. This decides only whether the new window is opened at all.
 */
export function decideCreate(input: CreateInput): CreateDecision {
  if (input.plan === undefined) {
    // No plan means the questions were cancelled before one existed. Treating
    // "nothing happened" as "everything succeeded" is how somebody lands in a
    // window onto a directory nothing wrote to.
    return { open: false, message: 'nothing was created.' }
  }
  if (input.plan.refused !== undefined) {
    return { open: false, message: `nothing was created: ${input.plan.refused}` }
  }
  if (input.applied === undefined) {
    return { open: false, message: 'nothing was written, so nothing was opened.' }
  }

  const { written, failed } = input.applied
  if (failed.length > 0) {
    // **Both halves named, in one message.** This is what the plan being a list
    // bought: a loop that threw on the third file would leave somebody with a
    // directory that is no longer empty — so trying again is refused by the
    // check that was protecting it — and no statement of what landed.
    return {
      open: false,
      message:
        `partly created and not opened. Written: ${written.join(', ') || 'nothing'}. ` +
        `Not written: ${failed.join(', ')}. The directory is no longer empty, so creating here ` +
        `again will be refused — clear it or finish it by hand.`,
    }
  }

  // Files there, history empty. Not a reason to withhold the project, and not a
  // thing to leave somebody to discover at their next `git log`.
  const note = input.plan.commit ? '' : ` ${input.plan.note ?? 'No first commit was made.'}`
  return { open: true, message: `created ${written.length} file(s).${note}` }
}
