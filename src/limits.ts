/**
 * What the project asks of the container, and what it gets when it does not ask.
 *
 * Ported from `start/src/main.rs`, which is the behaviour being replaced, and
 * the reasoning there is worth keeping: the limit has to be *observable* inside
 * the container. `--cpus` sets a CFS quota the guest cannot see, so anything
 * that self-tunes from the CPU count — ninja, `make -j$(nproc)`, Gradle and
 * Jest worker pools — oversubscribes by the ratio and, with memory capped, gets
 * OOM-killed rather than merely running slowly. `--cpuset-cpus` sets affinity,
 * which `sched_getaffinity` and therefore `nproc` do reflect.
 */

/** What this used before a manifest could say anything. */
const DEFAULT_MEMORY = '6g'

export interface Limits {
  memory: string
  memorySwap: string
  /** How many cores to pin — **not** a quota. See cpusetRange. */
  cpus: number | undefined
  /** True when the manifest could not be read at all, so this is all defaults. */
  usedDefaults: boolean
}

/**
 * `6g` → `8g`, `4096m` → `6144m`.
 *
 * A unit this does not understand is handed back unchanged, which produces a
 * `--memory-swap` equal to `--memory`: swap disabled. That is what the launcher
 * did for most of its life and is a safe place to land — the alternative is
 * guessing a number from a unit we did not recognise and handing Docker a pair
 * it refuses, in a message that names neither value.
 */
export function plusTwoGigabytes(memory: string): string {
  const match = /^(\d+)(g|m)$/.exec(memory)
  if (!match) return memory
  const n = Number(match[1])
  return match[2] === 'g' ? `${n + 2}g` : `${n + 2048}m`
}

/**
 * The project's choice as an inclusive range, or half the host's.
 *
 * Half, because the other half is what keeps the editor — and the rest of the
 * machine — responsive while the container builds. That split is the whole
 * point of this project; it only became true once the editor moved out.
 */
export function cpusetRange(cpus: number | undefined, hostCpus: number): string {
  const chosen =
    cpus !== undefined && cpus >= 1 ? cpus : Math.max(1, Math.floor(hostCpus / 2))
  return `0-${chosen - 1}`
}

/**
 * Reads `.code-server.stack.json`. Every field is optional and every default is
 * what the launcher used, so a project that has never heard of `limits` gets
 * exactly what it got yesterday.
 *
 * `usedDefaults` is the part the launcher did not have. It fell back silently,
 * with the reasoning that `setup` is where a bad value should be caught — fair
 * for something with nowhere to say it. This has somewhere to say it, and
 * opening with 6 GiB when the file asked for 8 without a word is what turns
 * this into an unexplained OOM hours later.
 */
export function readLimits(raw: string): Limits {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaults(true)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return defaults(true)
  }

  const limits = (parsed as { limits?: unknown }).limits
  const field = (name: string): unknown =>
    typeof limits === 'object' && limits !== null && !Array.isArray(limits)
      ? (limits as Record<string, unknown>)[name]
      : undefined

  // Wrong types are ignored rather than forwarded: `"memory": 6` would reach
  // Docker as `--memory 6`, which is six bytes, and the container would die
  // immediately for a reason nobody would connect to this file.
  const memoryField = field('memory')
  const memory = typeof memoryField === 'string' && memoryField !== '' ? memoryField : DEFAULT_MEMORY

  const swapField = field('memorySwap')
  const memorySwap =
    typeof swapField === 'string' && swapField !== '' ? swapField : plusTwoGigabytes(memory)

  const cpusField = field('cpus')
  const cpus =
    typeof cpusField === 'number' && Number.isInteger(cpusField) && cpusField >= 1
      ? cpusField
      : undefined

  return { memory, memorySwap, cpus, usedDefaults: false }
}

function defaults(usedDefaults: boolean): Limits {
  return {
    memory: DEFAULT_MEMORY,
    memorySwap: plusTwoGigabytes(DEFAULT_MEMORY),
    cpus: undefined,
    usedDefaults,
  }
}
