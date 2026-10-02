/**
 * What building is, as functions over what the host looks like.
 *
 * **The editor's API is a shell over these.** `createTerminal` is handed what
 * `buildCommand` returns and `onDidCloseTerminal` is handed to `buildOutcome`;
 * nothing in here knows about the editor, which is why all of it is tested
 * without one.
 */

export type Manager = 'apt' | 'dnf' | 'pacman'
export type Tool = 'jq' | 'docker'
export type DockerState = 'ok' | 'unusable' | 'absent' | 'unknown'

export interface HostChecks {
  jq: boolean
  docker: DockerState
  manager: Manager | null
}

export interface HostProblem {
  message: string
  /** Whether a build must not be attempted. An unknown check is not blocking. */
  blocking: boolean
}

/**
 * The command the terminal runs.
 *
 * **`/bin/sh` is in the path for exactly one reason: the redirect.**
 * `createTerminal` gives its process a pty, and a pty is what `setup` uses to
 * decide whether to ask — so without `</dev/null` the build would stop on
 * questions the editor has already answered, and `createTerminal` exposes no way
 * to set standard input.
 *
 * This is not what `sendText` was rejected for. Nothing is typed into a shell
 * somebody can edit, the exit code is observable, and **the script's path arrives
 * as `$0` rather than inside the command string** — so a directory with a space
 * in it is not a quoting problem.
 */
export function buildCommand(setupPath: string): { shellPath: string; shellArgs: string[] } {
  return { shellPath: '/bin/sh', shellArgs: ['-c', 'exec "$0" </dev/null', setupPath] }
}

/**
 * What a closed terminal means.
 *
 * **No exit code is a cancellation, not a failure.** A terminal closed mid-build
 * leaves none, and reporting that as a failure makes "I stopped it" look like "it
 * broke" — which FR-66 asks for specifically because the two are otherwise
 * indistinguishable.
 */
export function buildOutcome(code: number | undefined): 'ok' | 'failed' | 'cancelled' {
  if (code === undefined) return 'cancelled'
  return code === 0 ? 'ok' : 'failed'
}

/**
 * Which package manager this host has, by which command exists.
 *
 * The same detection `init` has used for a year, rather than parsing
 * `/etc/os-release`: a distribution that renames itself still has its manager,
 * and the manager is what the name has to be right for.
 */
export function detectManager(exists: (command: string) => boolean): Manager | null {
  if (exists('apt-get')) return 'apt'
  if (exists('dnf')) return 'dnf'
  if (exists('pacman')) return 'pacman'
  return null
}

/**
 * The package a tool comes from, per manager.
 *
 * Ported from the shell table this replaces, which is deleted with `init`: it
 * exists once, where the only thing that reads it is. The risk it guards is
 * specific — a wrong name installs the wrong thing on somebody's host, and an
 * absent one installs nothing while appearing to succeed, which is why an unknown
 * tool returns null rather than its own name.
 */
export function packageFor(manager: Manager, tool: Tool): string | null {
  const table: Record<Manager, Partial<Record<Tool, string>>> = {
    apt: { jq: 'jq', docker: 'docker.io' },
    dnf: { jq: 'jq', docker: 'docker' },
    pacman: { jq: 'jq', docker: 'docker' },
  }
  return table[manager][tool] ?? null
}

/**
 * What is wrong with this host, in the order it is worth saying.
 *
 * **An unknown check does not block.** `docker info` hangs when the daemon is
 * unreachable rather than failing, so the caller bounds it and may not have an
 * answer — and refusing to build on "I could not tell" would turn a slow daemon
 * into a broken extension. Being wrong in the direction of attempting the build
 * is the only acceptable one: the build then fails with docker's own message,
 * which names the cause better than a guess here would.
 */
export function hostProblems(checks: HostChecks): HostProblem[] {
  const problems: HostProblem[] = []
  const install = (tool: Tool): string => {
    const name = checks.manager ? packageFor(checks.manager, tool) : null
    return name ? ` Install it: the package is '${name}'.` : ' Install it.'
  }

  if (!checks.jq) {
    problems.push({ message: `'jq' is not on PATH and setup needs it.${install('jq')}`, blocking: true })
  }

  switch (checks.docker) {
    case 'absent':
      problems.push({
        message: `'docker' is not on PATH and setup needs it.${install('docker')}`,
        blocking: true,
      })
      break
    case 'unusable':
      problems.push({
        message:
          "'docker' is there but the daemon is not usable by this user — either it is not " +
          'running, or you are not in the docker group.',
        blocking: true,
      })
      break
    case 'unknown':
      problems.push({
        message:
          'whether docker is usable could not be determined in time; the daemon may be ' +
          'unreachable. A build will be attempted anyway.',
        blocking: false,
      })
      break
    case 'ok':
      break
  }

  return problems
}
