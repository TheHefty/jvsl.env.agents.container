import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The questions the editor asks, as functions over a stacks directory and a
 * manifest.
 *
 * **The editor's API is a thin shell over these and holds no logic.** What can
 * be wrong here is a dropped manifest key and a stack list that does not come
 * from the stacks directory; neither involves a picker, and a test that asserts
 * `showQuickPick` was handed what one of these returned is a test of the mock.
 */

export interface Answers {
  /** Stack name to the version chosen for it. */
  stacks: Record<string, string>
  limits: { memory: string; memorySwap?: string; cpus?: number }
}

/**
 * The stacks the template has, which is the directories under `stacks/`.
 *
 * Not a list in this repository: a stack added to the template has to appear
 * here with no change on this side, which is the same property the image's
 * per-stack extension declarations have.
 *
 * An empty result is a real answer and the caller has to tell it apart from "no
 * stacks were selected": `.code-server/` exists and is empty until the submodule
 * is initialised, and a picker offering nothing reads as a broken extension
 * rather than a missing checkout.
 */
export function stacksAvailable(stacksDir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(stacksDir)
  } catch {
    return []
  }
  return entries
    .filter((name) => {
      try {
        return statSync(join(stacksDir, name)).isDirectory()
      } catch {
        return false
      }
    })
    .sort()
}

/**
 * That stack's versions, **in the file's order**.
 *
 * The order is load-bearing rather than incidental: the first entry is what both
 * this and `setup` offer for a stack the manifest does not mention, so sorting
 * them would change a default that two implementations agree on today.
 */
export function versionsOf(stacksDir: string, stack: string): string[] {
  const path = join(stacksDir, stack, 'versions.json')
  if (!existsSync(path)) return []
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** A stack's optional `requires.json`. Absent means it depends on nothing. */
export function requiresOf(stacksDir: string, stack: string): string[] {
  const path = join(stacksDir, stack, 'requires.json')
  if (!existsSync(path)) return []
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/**
 * Dependencies a selection declares and does not include.
 *
 * **It refuses rather than adding the missing stack**, which is the rule `setup`
 * already has and the reason written there: it fails loudly instead of changing
 * a selection somebody made. The story's gate chose pre-selection first and
 * reversed it — one rule in two places beats two rules, and the original reason
 * for the refusal (not picking a JDK version for somebody) no longer holds now
 * that both flows ask the version straight after.
 *
 * Separate from the pickers so the message can be asserted without one.
 */
export function missingDependencies(
  selected: readonly string[],
  stacksDir: string,
): Array<{ stack: string; needs: string }> {
  const found: Array<{ stack: string; needs: string }> = []
  for (const stack of selected) {
    for (const needs of requiresOf(stacksDir, stack)) {
      if (!selected.includes(needs)) found.push({ stack, needs })
    }
  }
  return found
}

/**
 * What gets written, from what is there and what was answered.
 *
 * **It strips the keys this project owns and adds back what was answered**,
 * which is `setup`'s own `jq` pipeline rather than a reimplementation of the
 * idea. Keeping only the selected keys is the obvious version and is the one
 * that ate a project's own settings once: the manifest is the only per-project
 * record of intent, and a feature was blocked by exactly that. Stripping by name
 * is also what keeps "a deselected stack disappears" true without any uninstall
 * logic.
 *
 * `limits` is replaced whole rather than merged, because `setup` replaces it
 * whole: two shapes of the same field depending on which door the answer came
 * through is worse than either shape.
 */
export function nextManifest(
  current: Record<string, unknown>,
  answers: Answers,
  knownStacks: readonly string[],
): Record<string, unknown> {
  const owned = new Set<string>([...knownStacks, 'limits'])
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(current)) {
    if (!owned.has(key)) next[key] = value
  }
  for (const [stack, version] of Object.entries(answers.stacks)) {
    next[stack] = version
  }
  const limits: Record<string, unknown> = { memory: answers.limits.memory }
  if (answers.limits.memorySwap) limits.memorySwap = answers.limits.memorySwap
  if (answers.limits.cpus !== undefined) limits.cpus = answers.limits.cpus
  next.limits = limits
  return next
}

/**
 * The versions to offer, with the recorded one first.
 *
 * **The default is what makes a rerun bearable.** Without it every rerun retypes
 * everything, which is how a tool stops being rerun — the same reasoning `setup`
 * records for keeping its own prompts' defaults, and the same behaviour its
 * `read` loop has.
 *
 * A recorded version the stack no longer offers is still offered first, so a
 * project pinned to something that has since been dropped sees what it has
 * rather than silently moving. Choosing it is then the person's problem and a
 * visible one; `setup` refuses it, which is the louder half of the same answer.
 */
export function orderedVersions(versions: readonly string[], recorded?: string): string[] {
  if (!recorded) return [...versions]
  return [recorded, ...versions.filter((v) => v !== recorded)]
}

/**
 * The limits to offer, from the manifest or from the defaults.
 *
 * **These two numbers have to agree with `setup`'s**, and until this function
 * existed they were a literal in the editor's wiring and a literal in a shell
 * script, in two repositories. `6g` is the memory default in both; swap and cpus
 * are empty, which both sides read as "derive it".
 */
export function limitDefaults(manifest: Record<string, unknown> | null): {
  memory: string
  memorySwap: string
  cpus: string
} {
  const limits = (manifest?.limits ?? {}) as Record<string, unknown>
  return {
    memory: typeof limits.memory === 'string' ? limits.memory : '6g',
    memorySwap: typeof limits.memorySwap === 'string' ? limits.memorySwap : '',
    cpus: limits.cpus === undefined || limits.cpus === null ? '' : String(limits.cpus),
  }
}
