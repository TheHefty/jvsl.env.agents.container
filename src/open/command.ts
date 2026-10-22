import { homedir } from 'node:os'
import * as vscode from 'vscode'

import { handsOver } from '../build/build.ts'
import { buildInTerminal } from '../build/command.ts'
import { projectNames } from '../build/devcontainer.ts'
import { findGradleBuildsFor } from '../build/gradle.ts'
import { filesFor } from '../host/files.ts'
import { carried } from '../build/template.ts'
import { instructionWrites } from '../configure/instructions.ts'
import { extensionVersion } from '../host/detected.ts'
import { dockerFor, localDocker, type Docker } from '../host/docker.ts'
import { factsFor } from '../host/host.ts'
import { homeFor, type Home } from '../host/home.ts'
import { mountPath, type ProjectOnHost } from '../host/locate.ts'
import { hostProject } from '../host/project.ts'
import { CONFIG_PATH, decideOpen, imageStateFrom, prepareHere, REOPEN_COMMAND, serialise, type OpenContext, type ImageState } from './open.ts'
import { MANIFEST } from '../shared/stack-manifest.ts'

/**
 * Decides, writes, and says what needs saying. `handOver` is the difference
 * between activation — which leaves the asking to the tooling — and the command,
 * which was invoked precisely because somebody wants it open now.
 */
export async function prepare(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
  write: (lines: string[]) => void,
  options: { handOver: boolean },
): Promise<void> {
  const here = prepareHere(vscode.env.remoteName)
  if (!here.act) {
    write([`open flow: nothing to do — ${here.why}`])
    return
  }
  const project = hostProject()
  if (project.kind === 'none') return

  // Whose credentials the container is given: refused here, before anything is
  // written, when a distro will not say where its home is.
  const home = await homeFor(project)
  if (!home.ok) {
    write([`refused: ${home.reason}`])
    void vscode.window.showErrorMessage(`${home.reason}. Nothing was written.`)
    return
  }

  const openContext = await gather(project, context, write, home.home)
  const decision = decideOpen(openContext)

  if (decision.action === 'refuse') {
    write([`refused: ${decision.cause}`])
    const show = 'Show details'
    const chosen = await vscode.window.showWarningMessage(decision.cause, show)
    if (chosen === show) channel.show(true)
    return
  }

  const files = filesFor(project)
  const serialised = serialise(decision.configuration)
  try {
    // Before the file, because a bind source that does not exist fails the
    // mount rather than being created — see Decision.ensureHostDirs. Created
    // where the project lives: through the distro for a WSL project.
    for (const dir of decision.ensureHostDirs) files.mkdirAbsolute(dir)
    files.write(CONFIG_PATH, serialised)
  } catch (error) {
    const cause = `could not write ${CONFIG_PATH}: ${String(error)}`
    write([cause])
    void vscode.window.showErrorMessage(cause)
    return
  }

  write([
    `wrote ${CONFIG_PATH}`,
    ...decision.configuration.runArgs.length > 0
      ? [`runArgs: ${decision.configuration.runArgs.join(' ')}`]
      : [],
    ...decision.log,
    ...decision.notes.map((n) => `note: ${n}`),
  ])

  // **After the configuration and never before it.** These are tracked files in
  // somebody's repository; the configuration is gitignored and disposable. If
  // writing the configuration failed, this function has already returned, and
  // leaving a project with new instruction files and no way to open it would be
  // the worst of the three outcomes.
  for (const w of instructionWrites(files, carried(context.extensionPath, 'assets', 'project'))) {
    if (w.action === 'keep') {
      write([`${w.name}: kept — ${w.because ?? 'unchanged'}`])
      continue
    }
    try {
      files.write(w.name, w.contents ?? '')
      write([`wrote ${w.name}`])
    } catch (error) {
      // Not fatal. A project that cannot take its instruction files can still
      // be opened, and saying so is more use than refusing the open over it.
      write([`${w.name}: could not be written: ${String(error)}`])
    }
  }

  // Shown because the tooling's own notification cannot say any of it, and the
  // alternative is a project that opens with limits nobody asked for.
  for (const note of decision.notes) {
    void vscode.window.showWarningMessage(note)
  }

  if (decision.action === 'build') {
    write([`open: ${decision.cause}`])
    const outcome = await buildInTerminal(project, context.extensionPath, write)
    write([`open: build ${outcome}`])
    if (!handsOver(outcome)) {
      // Said rather than left silent: a terminal that closed is not obviously
      // a decision the extension noticed.
      void vscode.window.showWarningMessage(
        outcome === 'cancelled'
          ? 'The build was stopped, so the project was not opened.'
          : 'The build failed, so the project was not opened. Its output is in the terminal.',
      )
      return
    }
  }

  if (options.handOver || decision.action === 'build') {
    await vscode.commands.executeCommand(REOPEN_COMMAND)
  }
}

export async function gather(
  project: Exclude<ProjectOnHost, { kind: 'none' }>,
  context: vscode.ExtensionContext,
  write: (lines: string[]) => void,
  home: Home = { mount: homedir(), local: homedir() },
): Promise<OpenContext> {
  const docker = dockerFor(project)
  const files = filesFor(project)
  const gradle = findGradleBuildsFor(project, files)
  write(gradle.log)
  // Facts from where the container will run. A daemon that does not answer is
  // refused a few lines on, by the image check, so here it only must not throw.
  const measured = await factsFor(project, docker).catch((error: unknown) => {
    write([`facts: docker could not be asked (${String(error)})`])
    return { facts: { cpuCount: 1, devicesPresent: [], devicesAbsent: [] }, notes: [] }
  })
  write(measured.notes.map((n) => `facts: ${n}`))
  return {
    // What docker mounts and names the image after: the Linux path in a distro.
    // Files are read where the project lives (host/files.ts).
    projectRoot: mountPath(project),
    homeDir: home.mount,
    localHome: home.local,
    extensionVersion: extensionVersion(context),
    facts: measured.facts,
    factNotes: measured.notes,
    manifest: files.read(MANIFEST),
    existingConfig: files.read(CONFIG_PATH),
    runningContainers: await runningContainers(write, docker),
    reopenCommandAvailable: (await vscode.commands.getCommands(true)).includes(REOPEN_COMMAND),
    gitignore: files.read('.gitignore'),
    image: await imageState(projectNames(mountPath(project)).image, write, docker),
    gradleBuilds: gradle.builds,
    platform: process.platform,
  }
}

/**
 * Names of running containers. A runtime that cannot be reached yields none:
 * refusing on that is FR-24, which belongs to the story that owns every
 * refusal, and guessing it here would duplicate that message badly. It is
 * written to the channel so the next failure is not a surprise.
 */
/**
 * Whether the project's image is there, and **`unknown` when that cannot be
 * told apart from the daemon not answering.**
 *
 * `docker image inspect` exits non-zero for a missing image and for an
 * unreachable daemon alike, and the two must not be collapsed: FR-24 already
 * refuses an unreachable daemon, and reading it as a missing image would start
 * a build that takes minutes and then fails for a third reason.
 *
 * The distinction is made by asking a second question. `docker version
 * --format {{.Server.Version}}` answers only when there is a daemon, so a
 * failed inspect plus a working version is **absent**, and a failed inspect
 * plus a failed version is **unknown**. One extra process, on the path where
 * something is already wrong.
 */
export async function imageState(
  image: string,
  write: (lines: string[]) => void,
  docker: Docker = localDocker,
): Promise<ImageState> {
  let inspect: 'ok' | Error = 'ok'
  let version: 'ok' | Error | undefined
  try {
    await docker(['image', 'inspect', image])
  } catch (error) {
    inspect = error as Error
    try {
      await docker(['version', '--format', '{{.Server.Version}}'])
      version = 'ok'
    } catch (e) {
      version = e as Error
    }
  }
  const state = imageStateFrom(inspect, version)
  if (state === 'absent') write([`image ${image}: not present`])
  if (state === 'unknown' || state === 'no-docker') write([`image ${image}: could not be determined — ${String(version)}`])
  return state
}

export async function runningContainers(
  write: (lines: string[]) => void,
  docker: Docker = localDocker,
): Promise<string[]> {
  try {
    const { stdout } = await docker(['ps', '--format', '{{.Names}}'])
    return stdout.split('\n').map((n) => n.trim()).filter((n) => n !== '')
  } catch (error) {
    write([`could not list running containers: ${String(error)}`])
    return []
  }
}
