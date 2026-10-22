import { readFileSync } from 'node:fs'

import { detectManager, type SandboxConditions, type DockerState, type HostChecks } from '../build/build.ts'
import { localDocker, run, type Docker } from './docker.ts'

/**
 * What the host has, bounded.
 *
 * **An answer that does not arrive in time is `unknown`, not bad.** `docker info`
 * hangs when the daemon is unreachable rather than failing, and this runs on
 * activation as well as before a build — an activation that waits for it is a
 * window opening slowly with nothing saying why.
 */
export async function hostChecks(docker: Docker = localDocker): Promise<HostChecks> {
  const onPath = async (command: string): Promise<boolean> => {
    try {
      await run('command', ['-v', command], { shell: '/bin/sh' })
      return true
    } catch {
      return false
    }
  }

  const [dockerPresent, apt, dnf, pacman] = await Promise.all([
    onPath('docker'),
    onPath('apt-get'),
    onPath('dnf'),
    onPath('pacman'),
  ])

  let state: DockerState = 'absent'
  if (dockerPresent) {
    state = 'unknown'
    try {
      await docker(['info'])
      state = 'ok'
    } catch (error) {
      state = (error as Error).message === 'timeout' ? 'unknown' : 'unusable'
    }
  }

  const exists = (command: string): boolean =>
    command === 'apt-get' ? apt : command === 'dnf' ? dnf : command === 'pacman' ? pacman : false

  return { docker: state, manager: detectManager(exists), sandbox: await sandboxConditions(docker) }
}

/**
 * What this host does to the agents' sandbox, read on the host where this
 * extension runs. **A read that fails is 'unknown'**, never a guess: a warning
 * that is sometimes false is one everybody learns to ignore. Absent /proc entry
 * means the kernel has no such restriction, which is every host but Ubuntu's.
 */
export async function sandboxConditions(docker: Docker = localDocker): Promise<SandboxConditions> {
  let dockerAppArmor: SandboxConditions['dockerAppArmor'] = 'unknown'
  try {
    const { stdout } = await docker(['info', '--format', '{{json .SecurityOptions}}'])
    dockerAppArmor = stdout.includes('name=apparmor')
  } catch {
    dockerAppArmor = 'unknown'
  }
  let usernsRestricted: SandboxConditions['usernsRestricted'] = 'unknown'
  try {
    usernsRestricted = readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1'
  } catch (error) {
    usernsRestricted = (error as NodeJS.ErrnoException).code === 'ENOENT' ? false : 'unknown'
  }
  return { dockerAppArmor, usernsRestricted }
}
