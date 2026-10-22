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
const shOnPath = async (command: string): Promise<boolean> => {
  try {
    await run('command', ['-v', command], { shell: '/bin/sh' })
    return true
  } catch {
    return false
  }
}

/**
 * Whether the docker client is there, **asked of docker itself** through the
 * project's location rather than of a `/bin/sh` that Windows does not have
 * (story the-build-runs-in-a-terminal-inside-the-distro): from Windows that
 * shell check failed, docker read as absent, and every build was refused.
 * `docker version` answers with the client even when no daemon does, so a
 * failure here is a client that could not run — not installed, or not in the
 * distro (`executable file not found`).
 */
async function clientPresent(docker: Docker): Promise<boolean> {
  try {
    await docker(['version', '--format', '{{.Client.Version}}'])
    return true
  } catch (error) {
    const e = error as NodeJS.ErrnoException
    if (e.code === 'ENOENT' || /not found|No such file/i.test(e.message)) return false
    // A client that ran and failed because no daemon answered: it is there.
    return true
  }
}

export async function hostChecks(
  docker: Docker = localDocker,
  platform: NodeJS.Platform = process.platform,
  onPath: (command: string) => Promise<boolean> = shOnPath,
): Promise<HostChecks> {
  // The package manager only names what to install, and only Linux has one of
  // these; elsewhere there is nothing to detect and nothing to run it with.
  const linux = platform === 'linux'
  const [dockerPresent, apt, dnf, pacman] = await Promise.all([
    clientPresent(docker),
    linux ? onPath('apt-get') : false,
    linux ? onPath('dnf') : false,
    linux ? onPath('pacman') : false,
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
