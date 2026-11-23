import { homedir } from 'node:os'

import { run } from '../host/docker.ts'
import { homeFor } from '../host/home.ts'
import { uncFor, type ProjectOnHost } from '../host/locate.ts'
import { IDEAS_PATH } from '../ideas/offer.ts'

/**
 * Where Brainstorm runs (story the-brainstorm-command-opens-the-ideation-
 * container, gh-364; task brainstorm-on-wsl-uses-the-default-distro).
 *
 * **On Windows, the default WSL distro, asked of no one.** The ideas live in
 * that distro user's `~/.claude`, as the journal does, so the container the
 * distro's docker builds binds a path inside it, never a Windows one. There is
 * no project to say which distro, so it is the one `wsl.exe` picks when none is
 * named. Anywhere else, this machine's home.
 *
 * A distro that does not answer, or answers with something that is not a name
 * or a home, is refused with what it said: a wrong guess writes the ideas, and
 * binds the credentials, of somebody else's home.
 */
export type BrainstormProject = Exclude<ProjectOnHost, { kind: 'none' }>

export type BrainstormPlace =
  | { ok: true; project: BrainstormProject; home: string }
  | { ok: false; reason: string }

type Runner = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

const boundedRun: Runner = (command, args) => run(command, args, { timeout: 10_000 })

export function defaultDistroArgv(): { command: string; args: string[] } {
  // No -d: the default distro. Fixed: nothing of the person is interpolated.
  return { command: 'wsl.exe', args: ['--exec', 'sh', '-c', 'printf %s "$WSL_DISTRO_NAME"'] }
}

export async function brainstormPlace(
  platform: NodeJS.Platform = process.platform,
  runner: Runner = boundedRun,
  thisHome: string = homedir(),
): Promise<BrainstormPlace> {
  if (platform !== 'win32') {
    return { ok: true, project: { kind: 'host', path: ideasIn(thisHome) }, home: thisHome }
  }

  const { command, args } = defaultDistroArgv()
  let distro: string
  try {
    distro = (await runner(command, args)).stdout.trim()
  } catch (error) {
    return { ok: false, reason: `the default WSL distro could not be asked its name: ${String(error)}` }
  }
  if (!/^[^\s\\/][^\n\r\\/]*$/.test(distro)) {
    return { ok: false, reason: `the default WSL distro gave ${JSON.stringify(distro)} as its name, which is not a distro name` }
  }

  const found = await homeFor({ kind: 'wsl', distro, path: '', linux: '' }, runner)
  if (!found.ok) return found
  const linux = ideasIn(found.home.mount)
  return { ok: true, project: { kind: 'wsl', distro, path: uncFor(distro, linux), linux }, home: found.home.mount }
}

/** The ideas folder under a home, in that home's own separators. */
function ideasIn(home: string): string {
  const sep = home.includes('\\') && !home.includes('/') ? '\\' : '/'
  return `${home.replace(/[\\/]+$/, '')}${sep}${IDEAS_PATH.split('/').join(sep)}`
}

/**
 * The folder the Brainstorm window opens on: a WSL window onto the distro's
 * folder, so the window's handover folder is the one handed over (see
 * handoverFolder), or the folder itself on this machine.
 */
export function openTarget(project: BrainstormProject): { scheme: string; authority: string; path: string } {
  if (project.kind === 'wsl') {
    return { scheme: 'vscode-remote', authority: `wsl+${encodeURIComponent(project.distro)}`, path: project.linux }
  }
  return { scheme: 'file', authority: '', path: project.path }
}
