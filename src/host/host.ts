import { existsSync } from 'node:fs'
import { availableParallelism } from 'node:os'

import { PROBE_IMAGE, type Docker } from './docker.ts'
import type { ProjectOnHost } from './locate.ts'

/** The device nodes the container may be given, when the host has them. */
export const CANDIDATE_DEVICES = ['/dev/fuse', '/dev/net/tun', '/dev/kvm'] as const

export interface HostFacts {
  cpuCount: number
  devicesPresent: string[]
  devicesAbsent: string[]
}

export interface HostProbe {
  cpuCount: () => number
  exists: (path: string) => boolean
  devices: readonly string[]
}

const realProbe: HostProbe = {
  cpuCount: () => availableParallelism(),
  exists: existsSync,
  devices: CANDIDATE_DEVICES,
}

/**
 * What this machine has. Injectable, because every assertion about it would
 * otherwise be an assertion about the machine the test happens to run on.
 *
 * The absent devices are kept rather than merely left out: `docker run
 * --device` against a path that does not exist is a hard failure rather than a
 * no-op, so the ones that are missing are a thing to be able to say out loud
 * when a project opens without hardware acceleration.
 */
export function hostFacts(probe: HostProbe = realProbe): HostFacts {
  const present: string[] = []
  const absent: string[] = []
  for (const device of probe.devices) {
    ;(probe.exists(device) ? present : absent).push(device)
  }
  return { cpuCount: probe.cpuCount(), devicesPresent: present, devicesAbsent: absent }
}

/** Probe output — one `/dev/...` per line — as the facts the configuration takes. */
export function parseProbe(stdout: string, devices: readonly string[] = CANDIDATE_DEVICES): Pick<HostFacts, 'devicesPresent' | 'devicesAbsent'> {
  const seen = new Set(stdout.split('\n').map((l) => l.trim()))
  return {
    devicesPresent: devices.filter((d) => seen.has(d)),
    devicesAbsent: devices.filter((d) => !seen.has(d)),
  }
}

/** How long the device probe may take, a pull of a small image included. */
export const PROBE_MS = 60_000

/**
 * The machine the project's container will run on, asked of the right place.
 *
 * **On native Linux, this machine**, as before: the editor, the extension and
 * the daemon share it. **Anywhere else, docker itself.** From a Windows editor
 * the extension runs on Windows, which has no /dev and whose core count is not
 * the Docker VM's; a `--device` naming something the daemon's machine lacks
 * stops the container from starting. So the cores are `docker info`'s and the
 * devices are listed by a container that mounts the daemon's /dev read-only —
 * exact for Docker inside a distro and for Docker Desktop alike (chosen on
 * 2026-10-22 over asking the distro, which is wrong for Docker Desktop).
 *
 * A probe that fails gives no devices and a note; the container then starts
 * without them and says so. A core count docker cannot give is a rejection:
 * there is no daemon to open against, which the open flow already refuses.
 */
export async function factsFor(
  project: ProjectOnHost,
  docker: Docker,
  platform: NodeJS.Platform = process.platform,
  probe: HostProbe = realProbe,
): Promise<{ facts: HostFacts; notes: string[] }> {
  if (project.kind === 'host' && platform === 'linux') return { facts: hostFacts(probe), notes: [] }
  const cpus = Number.parseInt((await docker(['info', '--format', '{{.NCPU}}'])).stdout.trim(), 10)
  if (!Number.isInteger(cpus) || cpus < 1) throw new Error('docker info did not give a core count')
  const list = probe.devices.map((d) => `[ -e /host-dev/${d.replace(/^\/dev\//, '')} ] && echo ${d}`).join('; ')
  try {
    const { stdout } = await docker(
      ['run', '--rm', '-v', '/dev:/host-dev:ro', PROBE_IMAGE, 'sh', '-c', `${list}; true`],
      PROBE_MS,
    )
    return { facts: { cpuCount: cpus, ...parseProbe(stdout, probe.devices) }, notes: [] }
  } catch (error) {
    return {
      facts: { cpuCount: cpus, devicesPresent: [], devicesAbsent: [...probe.devices] },
      notes: [
        `the devices of the machine docker runs on could not be listed (${String(error)}), so the ` +
          `container starts without /dev/fuse, /dev/net/tun and /dev/kvm. Nested Docker and the ` +
          `emulator will say they are unavailable. Opening again once the probe can run passes them.`,
      ],
    }
  }
}
