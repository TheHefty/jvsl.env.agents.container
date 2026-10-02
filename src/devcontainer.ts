import { basename } from 'node:path'

import { cpusetRange, type Limits } from './limits.ts'
import type { HostFacts } from './host.ts'

/**
 * The property that marks a configuration as this extension's.
 *
 * It carries the extension's version and **nothing that changes between
 * opens**. The tooling identifies a container by a hash of the configuration,
 * so a file that differs on every open makes every open recreate the container
 * — killing whatever was running inside it, unasked, every time. A timestamp
 * was proposed for this and withdrawn for exactly that reason; "when it was
 * generated" goes to the output channel, which is not hashed.
 */
export const GENERATED_BY = 'x-jvsl-generated'

export interface Configuration {
  name: string
  image: string
  workspaceMount: string
  workspaceFolder: string
  mounts: string[]
  capAdd: string[]
  securityOpt: string[]
  containerEnv: Record<string, string>
  /** Always false. See buildConfiguration. */
  overrideCommand: boolean
  runArgs: string[]
  [GENERATED_BY]: { extension: string }
}

export interface BuildInput {
  projectRoot: string
  homeDir: string
  extensionVersion: string
  limits: Limits
  facts: HostFacts
}

export interface ProjectNames {
  repo: string
  image: string
  volume: string
  launcherContainer: string
}

/**
 * The same naming the launcher and `setup` already use — repository basename
 * plus a suffix — so neither has to be configured separately with the same
 * value. `launcherContainer` is what a running `start` would be called, which
 * is how the refusal in open.ts finds it.
 */
export function projectNames(projectRoot: string): ProjectNames {
  const repo = basename(projectRoot)
  return {
    repo,
    image: `${repo}-dev`,
    volume: `${repo}-code-server-data`,
    launcherContainer: `${repo}-app`,
  }
}

/**
 * The configuration, from the project's manifest and this host's hardware.
 *
 * **Native properties wherever the specification has one, `runArgs` only for
 * what it does not express.** A native property is validated by the tooling; a
 * `runArgs` string is handed to Docker verbatim, so a mistyped flag fails far
 * from where it was written. The specification has nothing for memory or CPU,
 * which is why exactly those are in `runArgs` — and the shape of the file then
 * says, by itself, that `runArgs` is where the values that depend on *this
 * machine* live.
 *
 * **No `remoteUser`.** The image declares it. If both did, the configuration
 * would win and the image could lie with nothing erroring.
 *
 * **No published port.** code-server runs unauthenticated here — measured — so
 * publishing it is opt-in, and the opt-in has nowhere to live yet: `setup`
 * rebuilds the project manifest from scratch and discards keys it did not
 * write. The default this requirement asks for is "not published", and that is
 * honoured in full.
 */
export function buildConfiguration(input: BuildInput): Configuration {
  const { projectRoot, homeDir, extensionVersion, limits, facts } = input
  const names = projectNames(projectRoot)

  const runArgs = [
    '--memory', limits.memory,
    '--memory-swap', limits.memorySwap,
    '--cpuset-cpus', cpusetRange(limits.cpus, facts.cpuCount),
  ]

  // Only what the host actually has: `--device` against a path that does not
  // exist is a hard failure rather than a no-op, so a host without hardware
  // virtualization would simply never open.
  for (const device of facts.devicesPresent) {
    runArgs.push('--device', device)
  }

  return {
    name: names.repo,
    image: names.image,
    workspaceMount: `source=${projectRoot},target=/config/workspace,type=bind`,
    workspaceFolder: '/config/workspace',
    mounts: [
      `source=${names.volume},target=/config,type=volume`,
      `source=${homeDir}/.claude,target=/config/.claude,type=bind`,
    ],
    capAdd: ['SYS_ADMIN'],
    securityOpt: ['seccomp=unconfined', 'systempaths=unconfined'],
    // **PUID and PGID only.** `PASSWORD: ''` lived here so that code-server
    // would not demand a password, and template 5.0.0 removed the editor from
    // the image. These two are the base image's `init-adduser`, which is what
    // makes a bind-mounted write land as the person rather than as uid 911 —
    // they look like the same kind of obscure variable and are not.
    containerEnv: { PUID: '1000', PGID: '1000' },
    // **The image's own command has to run.** For an image-based configuration
    // the tooling otherwise replaces it with `while sleep 1000; do :; done`,
    // and this image's command is s6-overlay — which is what starts the nested
    // rootless Docker daemon, starts the ai-memory server, applies PUID/PGID
    // and runs every cont-init script, the ownership repair among them.
    //
    // Leaving it at the default fails nothing. The editor connects, the shell
    // works, the limits are right — and there is no Docker inside the
    // container, no long-term memory, and no repair of the state directories
    // the previous release exists to repair. The specification says it plainly:
    // "set to false if the default command must run for the container to
    // function properly."
    //
    // Found by the story's first @manual pass, which is the reason that tag
    // exists.
    overrideCommand: false,
    runArgs,
    [GENERATED_BY]: { extension: extensionVersion },
  }
}

/**
 * Whether a configuration already on disk is one of ours.
 *
 * Anything else — including a file that cannot be parsed — is somebody's work,
 * and the open refuses rather than overwriting it. The file is gitignored, so
 * there is no history to recover it from.
 */
export function isOurs(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      GENERATED_BY in parsed
    )
  } catch {
    return false
  }
}
