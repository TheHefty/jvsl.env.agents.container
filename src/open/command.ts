import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import * as vscode from 'vscode'

import { handsOver } from '../build/build.ts'
import { build, buildInTerminal } from '../build/command.ts'
import { projectNames } from '../build/devcontainer.ts'
import { carried } from '../build/template.ts'
import { instructionWrites } from '../configure/instructions.ts'
import { extensionVersion } from '../host/detected.ts'
import { dockerBounded } from '../host/docker.ts'
import { hostFacts } from '../host/host.ts'
import { hostProject, readOrNull } from '../host/project.ts'
import { CONFIG_PATH, decideOpen, prepareHere, REOPEN_COMMAND, type OpenContext, type ImageState } from './open.ts'
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
  const root = project.path

  const openContext = await gather(root, context, write)
  const decision = decideOpen(openContext)

  if (decision.action === 'refuse') {
    write([`refused: ${decision.cause}`])
    const show = 'Show details'
    const chosen = await vscode.window.showWarningMessage(decision.cause, show)
    if (chosen === show) channel.show(true)
    return
  }

  const target = join(root, CONFIG_PATH)
  const serialised = `${JSON.stringify(decision.configuration, null, 2)}\n`
  try {
    // Before the file, because a bind source that does not exist fails the
    // mount rather than being created — see Decision.ensureHostDirs.
    for (const dir of decision.ensureHostDirs) mkdirSync(dir, { recursive: true })
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, serialised, 'utf8')
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
    ...decision.notes.map((n) => `note: ${n}`),
  ])

  // **After the configuration and never before it.** These are tracked files in
  // somebody's repository; the configuration is gitignored and disposable. If
  // writing the configuration failed, this function has already returned, and
  // leaving a project with new instruction files and no way to open it would be
  // the worst of the three outcomes.
  for (const w of instructionWrites(root, carried(context.extensionPath, 'assets', 'project'))) {
    if (w.action === 'keep') {
      write([`${w.name}: kept — ${w.because ?? 'unchanged'}`])
      continue
    }
    try {
      writeFileSync(join(root, w.name), w.contents ?? '', 'utf8')
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
    const outcome = await buildInTerminal(root, context.extensionPath, write)
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
  root: string,
  context: vscode.ExtensionContext,
  write: (lines: string[]) => void,
): Promise<OpenContext> {
  return {
    projectRoot: root,
    homeDir: homedir(),
    extensionVersion: extensionVersion(context),
    facts: hostFacts(),
    manifest: readOrNull(join(root, MANIFEST)),
    existingConfig: readOrNull(join(root, CONFIG_PATH)),
    runningContainers: await runningContainers(write),
    reopenCommandAvailable: (await vscode.commands.getCommands(true)).includes(REOPEN_COMMAND),
    gitignore: readOrNull(join(root, '.gitignore')),
    image: await imageState(projectNames(root).image, write),
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
): Promise<ImageState> {
  try {
    await dockerBounded(['image', 'inspect', image])
    return 'present'
  } catch {
    try {
      await dockerBounded(['version', '--format', '{{.Server.Version}}'])
      write([`image ${image}: not present`])
      return 'absent'
    } catch (error) {
      write([`image ${image}: could not be determined — ${String(error)}`])
      return 'unknown'
    }
  }
}

export async function runningContainers(write: (lines: string[]) => void): Promise<string[]> {
  try {
    const { stdout } = await dockerBounded(['ps', '--format', '{{.Names}}'])
    return stdout.split('\n').map((n) => n.trim()).filter((n) => n !== '')
  } catch (error) {
    write([`could not list running containers: ${String(error)}`])
    return []
  }
}
