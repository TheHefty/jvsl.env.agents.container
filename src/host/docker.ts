import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { ProjectOnHost } from './locate.ts'

/** Bounded because `docker info` hangs on an unreachable daemon rather than failing. */
export const DOCKER_CHECK_MS = 2000

export const run = promisify(execFile)

/**
 * Every call to docker, bounded.
 *
 * **An unbounded one hangs activation, and a hung activation is every command
 * reporting that it does not exist.** `docker info` was raced against a timeout
 * because it "hangs on an unreachable daemon rather than failing"; `image
 * inspect`, `version` and `ps` were not, and three of the four run inside the
 * path `activate` awaits. On 2026-10-06 the editor sat at `Activating…` for
 * ever while every palette entry answered `command 'jvsl.agentContainer.build'
 * not found` — which is what it says when it activates an extension to dispatch
 * a command and the activation never finishes.
 *
 * **One helper rather than a race at each call site.** The previous arrangement
 * had the race written out once, three lines from a call that did not get one.
 * A mechanism applied where somebody remembered is not a mechanism, and
 * `scripts/no-unbounded-docker-call.test.sh` now refuses any call that does not
 * come through here.
 *
 * It rejects on timeout rather than resolving, so callers keep the `catch` they
 * already had and a slow daemon reads as a daemon that did not answer — which
 * is what it is.
 */
export async function dockerBounded(
  args: string[],
  ms = DOCKER_CHECK_MS,
  where: DockerHost = LOCAL,
): Promise<{ stdout: string; stderr: string }> {
  const { command, args: argv } = dockerArgv(where, args)
  return Promise.race([
    // 64 MiB of output: execFile's default is 1 MiB, and a whole tracker read
    // by the board can pass that, failing as "maxBuffer exceeded".
    run(command, argv, { maxBuffer: 64 * 1024 * 1024 }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ])
}

/**
 * Where docker runs for a project: this machine, or a WSL distro seen from an
 * editor on Windows (epic a-windows-editor-opens-a-project-that-lives-in-wsl).
 * In a distro, docker reaches whichever daemon the distro uses — its own, or
 * Docker Desktop's through the WSL integration — which is the daemon the
 * container will run on.
 */
export type DockerHost = { kind: 'local' } | { kind: 'wsl'; distro: string }

const LOCAL: DockerHost = { kind: 'local' }

export function whereFor(project: ProjectOnHost): DockerHost {
  return project.kind === 'wsl' ? { kind: 'wsl', distro: project.distro } : LOCAL
}

/**
 * The process to spawn. **An argument array all the way down**: `wsl.exe
 * --exec` runs docker without a shell, so a project path holding spaces,
 * quotes or `$( )` stays one argument and is never read as a command.
 */
export function dockerArgv(where: DockerHost, args: readonly string[]): { command: string; args: string[] } {
  if (where.kind === 'local') return { command: 'docker', args: [...args] }
  return { command: 'wsl.exe', args: ['-d', where.distro, '--exec', 'docker', ...args] }
}

export type Docker = (args: string[], ms?: number) => Promise<{ stdout: string; stderr: string }>

/** Docker on this machine: the default where no project is known (activation, diagnostics). */
export const localDocker: Docker = (args, ms) => dockerBounded(args, ms, LOCAL)

/** Docker for one project, bounded, and running where that project's containers run. */
export function dockerFor(project: ProjectOnHost): Docker {
  const where = whereFor(project)
  return (args, ms) => dockerBounded(args, ms, where)
}

/**
 * The image the device probe runs, pinned by digest like every fetched
 * dependency: a tag can be repointed, and this one is pulled on a person's
 * machine the first time a project opens from Windows.
 */
export const PROBE_IMAGE = 'alpine:3.21@sha256:bbfcd601d7cd20d35bb0b8b866ad1a8a0d107ca3e1c20870c75c5ce2c1186d30'
