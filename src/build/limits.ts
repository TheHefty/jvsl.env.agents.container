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

/** A size in Docker's own form: digits with an optional b, k, m or g unit,
 * each optionally with a trailing b — `6g`, `6144m`, `2147483648`. `6 GB` and
 * `6.5g` are not, and Docker refuses both at container creation, naming a
 * flag and not the file the value came from (gh-326). */
export const DOCKER_SIZE = /^\d+(?:[kmg]b?)?$/i

/** What Configure's input boxes check as the developer types, so a bad value
 * is refused where it is typed, naming the form — the same shape `readLimits`
 * refuses again when the manifest is read. Empty is unset: the box starts
 * from a default, and clearing it means "keep the default", not a refusal. */
export function validateMemory(value: string): string | undefined {
  if (value === '' || DOCKER_SIZE.test(value)) return undefined
  return "Docker's size form only: digits with an optional b, k, m or g unit, and no space — like 6g, 6144m or 2147483648."
}

/** The cores question's check, bound by the host's own count. The read side
 * names its own bound in its refusal, so a WSL distro limited below the
 * machine is still refused there, with the number that applies. */
export function validateCpus(hostCpus: number): (value: string) => string | undefined {
  return (value) => {
    if (value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= hostCpus)) {
      return undefined
    }
    return `A whole number from 1 to ${hostCpus} (this host's cores), or empty for half the host's.`
  }
}

/** `readLimits`' answer: the limits to build with, and a refusal when the
 * manifest carries a shape Docker would reject far from its cause. */
export interface LimitsRead {
  limits: Limits
  /** Names the field, the value and the accepted form. The caller refuses on
   * it rather than forwarding or silently defaulting (gh-326). */
  refusal?: string
}

/**
 * Reads the project's manifest. Every field is optional and every default is
 * what the launcher used, so a project that has never heard of `limits` gets
 * exactly what it got yesterday.
 *
 * `usedDefaults` is the part the launcher did not have. It fell back silently,
 * with the reasoning that `setup` is where a bad value should be caught — fair
 * for something with nowhere to say it. This has somewhere to say it, and
 * opening with 6 GiB when the file asked for 8 without a word is what turns
 * this into an unexplained OOM hours later.
 *
 * **A present-but-malformed limit is refused, not forwarded and not
 * defaulted.** `"memory": 6` would reach Docker as six bytes; `"memory":
 * "6 GB"` as a flag error at container creation, inside Dev Containers,
 * naming neither this file nor the field; and the old behaviour — ignoring it
 * into the default — is that unexplained OOM wearing a different hat. `null`
 * is absent, the jq `// empty` semantics the rest of the manifest uses, and
 * `""` for a size is unset, because that is what Configure writes when a box
 * is cleared (gh-326).
 */
export function readLimits(raw: string, hostCpus: number): LimitsRead {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { limits: defaults(true) }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { limits: defaults(true) }
  }

  const limits = (parsed as { limits?: unknown }).limits
  const field = (name: string): unknown =>
    typeof limits === 'object' && limits !== null && !Array.isArray(limits)
      ? (limits as Record<string, unknown>)[name]
      : undefined

  const sizeOk = (value: unknown): boolean =>
    value === undefined || value === null || value === '' ||
    (typeof value === 'string' && DOCKER_SIZE.test(value))
  const cpusOk = (value: unknown): boolean =>
    value === undefined || value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= hostCpus)
  const refuseRead = (name: string, value: unknown, form: string): LimitsRead =>
    ({ limits: defaults(false), refusal: `limits.${name} ${JSON.stringify(value)} is not ${form}` })

  const memoryField = field('memory')
  if (!sizeOk(memoryField)) {
    return refuseRead('memory', memoryField, "a size in Docker's form — digits with an optional b, k, m or g unit, no space, like 6g or 6144m")
  }
  const swapField = field('memorySwap')
  if (!sizeOk(swapField)) {
    return refuseRead('memorySwap', swapField, "a size in Docker's form — digits with an optional b, k, m or g unit, no space, like 6g or 6144m")
  }
  const cpusField = field('cpus')
  if (!cpusOk(cpusField)) {
    return refuseRead('cpus', cpusField, `a whole number of cores from 1 to ${hostCpus}`)
  }

  const memory = typeof memoryField === 'string' && memoryField !== '' ? memoryField : DEFAULT_MEMORY

  const memorySwap =
    typeof swapField === 'string' && swapField !== '' ? swapField : plusTwoGigabytes(memory)

  const cpus =
    typeof cpusField === 'number' && Number.isInteger(cpusField) && cpusField >= 1
      ? cpusField
      : undefined

  return { limits: { memory, memorySwap, cpus, usedDefaults: false } }
}

function defaults(usedDefaults: boolean): Limits {
  return {
    memory: DEFAULT_MEMORY,
    memorySwap: plusTwoGigabytes(DEFAULT_MEMORY),
    cpus: undefined,
    usedDefaults,
  }
}
