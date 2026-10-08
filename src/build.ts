import { carried } from './template.ts'
import { MANIFEST } from './shared/stack-manifest.ts'
/**
 * What building is, as functions over what the host looks like.
 *
 * **The editor's API is a shell over these.** `createTerminal` is handed what
 * `composeAndBuildCommand` returns and `onDidCloseTerminal` is handed to `buildOutcome`;
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
  /** What this host does to the agents' sandbox. Absent when not read. */
  sandbox?: SandboxConditions
}

/**
 * Two things on a host with AppArmor stop `bwrap`, and with it the agents'
 * sandbox, measured on GitHub's Ubuntu runner (the debt
 * the-sandbox-under-apparmor in the tracker). Each is true, false, or
 * 'unknown' when it could not be read, and unknown claims nothing.
 */
export interface SandboxConditions {
  /** `docker info` lists `name=apparmor` among its security options. */
  dockerAppArmor: boolean | 'unknown'
  /** `/proc/sys/kernel/apparmor_restrict_unprivileged_userns` reads 1. */
  usernsRestricted: boolean | 'unknown'
}

/**
 * The warnings a host's AppArmor earns: **never blocking**, because the image
 * builds and only the sandbox fails, and **never a change to the host**, because
 * widening confinement is the operator's decision, not this extension's. Each
 * says what fails, why, and what the operator of that host can decide.
 */
export function sandboxWarnings(c: SandboxConditions): HostProblem[] {
  const out: HostProblem[] = []
  if (c.usernsRestricted === true) {
    out.push({
      blocking: false,
      message:
        "the agents' sandbox will not open on this host: the kernel restricts unprivileged user " +
        'namespaces (kernel.apparmor_restrict_unprivileged_userns=1), and bwrap needs one. The image ' +
        'still builds. Whether to lift it is your decision about this host: ' +
        '`sudo sysctl kernel.apparmor_restrict_unprivileged_userns=0`, or an AppArmor profile that allows bwrap.',
    })
  }
  if (c.dockerAppArmor === true) {
    out.push({
      blocking: false,
      message:
        "the agents' sandbox may not open on this host: Docker confines containers with AppArmor, and " +
        'its default profile denies the mounts bwrap makes inside the container. The image still builds. ' +
        'The generated configuration does not pass apparmor=unconfined, by design: widening the ' +
        "container's confinement is a decision this extension does not make for you.",
    })
  }
  return out
}

export interface HostProblem {
  message: string
  /** Whether a build must not be attempted. An unknown check is not blocking. */
  blocking: boolean
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

  if (checks.sandbox !== undefined) problems.push(...sandboxWarnings(checks.sandbox))

  return problems
}

/** What composing and building a project's image takes. */
export interface Compose {
  /** The carried composer — never a project's own copy. */
  script: string
  /** Stacks, in the order the manifest lists them. */
  stacks: string[]
  /** `STACK_MANIFEST`: which version of each stack this project asked for. */
  manifest: string
  /** `docker build`'s context, which is where `core/` and `stacks/` are. */
  context: string
  image: string
}

/**
 * The invocation, which must match the one CI makes rather than merely call the
 * same file.
 *
 * `core/compose-dockerfile.sh` was extracted from `setup` for exactly this
 * reason, and its own header records what happened when two callers each built
 * the concatenation themselves: the copies drifted, CI's ignored
 * `requires.json`, and `stack-build (android)` built core+android with no JDK
 * and died on a Java-based tool — a CI-only failure that never reproduced
 * through `setup`.
 *
 * So shelling out is the decision, and these fields are the parts of the
 * invocation that can still differ while calling the same script. The context
 * is the one most easily got wrong: the composed Dockerfile has `COPY core/…`
 * and `COPY stacks/…` relative to it, so a context of the project's workspace
 * builds nothing — or builds whatever that project happens to have there.
 */
export function composeCommand(
  extensionPath: string,
  workspace: string,
  stacks: string[],
): Compose {
  const basename = workspace.replace(/\/+$/, '').split('/').pop() ?? 'project'
  return {
    script: carried(extensionPath, 'core', 'compose-dockerfile.sh'),
    stacks,
    manifest: `${workspace}/${MANIFEST}`,
    context: extensionPath,
    image: `${basename}-dev`,
  }
}

/** Single-quote for `sh`, which is what makes a path with a space survive. */
function quote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/**
 * Compose, then build, in one terminal.
 *
 * **The quoting is deliberate here and it was inherited before.**
 * The function this replaced passed the script as `$0` precisely so a
 * directory with a space in it was not a quoting problem; composing needs a
 * command string again, which gives that problem back. Every path is quoted, and the test
 * beside this one uses paths with spaces rather than trusting the reading.
 *
 * `</dev/null` stays for the reason the old single-command version had it:
 * `createTerminal` provides a pty, and a pty is what a script uses to decide
 * whether to ask.
 * Nothing here asks, and a composer that paused for an answer would hang a
 * terminal with no prompt visible.
 */
export function composeAndBuildCommand(
  c: Compose,
  dockerfileOut: string,
): { shellPath: string; shellArgs: string[] } {
  const script = [
    'set -e',
    `STACK_MANIFEST=${quote(c.manifest)} ${quote(c.script)} ${c.stacks.map(quote).join(' ')} > ${quote(dockerfileOut)}`,
    `docker build -f ${quote(dockerfileOut)} -t ${quote(c.image)} ${quote(c.context)}`,
  ].join('\n')
  // **The braces matter.** `A; B </dev/null` redirects B alone, so the
  // composer — the step that would actually ask something — would still have
  // the terminal's pty on stdin. A test regex noticed this by accident; the
  // group is what makes the redirect apply to both.
  return { shellPath: '/bin/sh', shellArgs: ['-c', `{\n${script}\n} </dev/null`] }
}

/**
 * Whether a finished build opens the project.
 *
 * **One line, and it exists so the two opposite mistakes are impossible to make
 * separately.** Refusing to hand over after a good build strands somebody with
 * a built image and a window that never attached. Handing over after a
 * cancelled one attaches them to a half-built image they asked to stop — and a
 * cancelled build is somebody deciding not to open the project, not a failure
 * to report.
 *
 * Expressed as a function over the outcome rather than as an `if` at the call
 * site, because the call site is the part no test can reach.
 */
export function handsOver(outcome: 'ok' | 'failed' | 'cancelled'): boolean {
  return outcome === 'ok'
}

/** Dev Containers' own rebuild, from a window already inside the container. */
export const REBUILD_IN_CONTAINER = 'remote-containers.rebuildContainer'
/** Dev Containers' own rebuild, from a local window: recreates and reopens. */
export const REBUILD_FROM_HOST = 'remote-containers.rebuildAndReopenInContainer'

export type ContainerForImage =
  | { kind: 'one'; id: string; name: string; image: string }
  | { kind: 'none' }
  | { kind: 'many'; names: string[] }

export type AfterBuild =
  | { say: 'nothing' }
  | { say: 'stale'; message: string; command: string }
  | { say: 'ambiguous'; message: string }

/**
 * What to say after a successful build about the project's container.
 *
 * **Dev Containers reuses a project's existing container**, which stays bound to
 * the image it was created from, so a rebuilt image reached nothing until the
 * operator removed the container by hand (the debt
 * a-rebuilt-image-does-not-reach-the-running-container in the tracker).
 *
 * **This never removes anything.** Recreating a container ends everything
 * running in it, agent sessions included, so the only action it returns is
 * Dev Containers' own rebuild command, run when the person chooses it. An
 * image that could not be read claims nothing.
 */
export function afterBuild(input: {
  built: string | undefined
  container: ContainerForImage
  inContainer: boolean
}): AfterBuild {
  const { built, container, inContainer } = input
  if (container.kind === 'many') {
    return {
      say: 'ambiguous',
      message: `More than one container claims this project (${container.names.join(', ')}), so none is recreated. ` +
        'Remove the ones not in use, then rebuild from Dev Containers.',
    }
  }
  if (container.kind === 'none' || !built || !container.image || container.image === built) return { say: 'nothing' }
  return {
    say: 'stale',
    message: `The image was built, but the container ${container.name} still runs the previous image. ` +
      'Recreating it ends everything running inside; what is in /config stays on its volume.',
    command: inContainer ? REBUILD_IN_CONTAINER : REBUILD_FROM_HOST,
  }
}
