import { existsSync } from 'node:fs'
import { availableParallelism } from 'node:os'

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
