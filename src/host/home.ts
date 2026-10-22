import { homedir } from 'node:os'

import { run } from './docker.ts'
import { uncFor, type ProjectOnHost } from './locate.ts'

/**
 * The home whose `.claude` the container is given, as two paths to one place:
 * `mount`, as the docker that runs the container sees it, for the bind source;
 * and `local`, as this machine reaches it, for creating the directory before
 * the container is (a bind source that does not exist fails the mount).
 *
 * **For a WSL project, the distro user's home** (story
 * the-agents-credentials-bound-into-the-container-are-the-distros): the agent
 * logs in inside WSL, and a Windows path is nothing the distro's docker can
 * bind. Read once from the distro; a home it does not give is refused rather
 * than replaced by the Windows one, which would bind nothing, or the wrong
 * credentials.
 */
export interface Home {
  mount: string
  local: string
}

export function homeArgv(distro: string): { command: string; args: string[] } {
  // Fixed: nothing of the project or the person is interpolated into it.
  return { command: 'wsl.exe', args: ['-d', distro, '--exec', 'sh', '-c', 'printf %s "$HOME"'] }
}

type Runner = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

const boundedRun: Runner = (command, args) => run(command, args, { timeout: 10_000 })

export async function homeFor(
  project: Exclude<ProjectOnHost, { kind: 'none' }>,
  runner: Runner = boundedRun,
  thisHome: string = homedir(),
): Promise<{ ok: true; home: Home } | { ok: false; reason: string }> {
  if (project.kind !== 'wsl') return { ok: true, home: { mount: thisHome, local: thisHome } }
  const { command, args } = homeArgv(project.distro)
  let out: string
  try {
    out = (await runner(command, args)).stdout.trim()
  } catch (error) {
    return { ok: false, reason: `the home of the WSL distro "${project.distro}" could not be read: ${String(error)}` }
  }
  if (!out.startsWith('/') || out.includes('\n')) {
    return { ok: false, reason: `the WSL distro "${project.distro}" gave "${out}" as its home, which is not a path inside it` }
  }
  return { ok: true, home: { mount: out, local: uncFor(project.distro, out) } }
}
