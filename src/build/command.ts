import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as vscode from 'vscode'

import { composeAndBuildCommand, composeForProject, buildOutcome, hostProblems, afterBuild, type ContainerForImage } from './build.ts'
import { projectNames } from './devcontainer.ts'
import { hostChecks } from '../host/checks.ts'
import { run, dockerBounded } from '../host/docker.ts'
import { hostProcessTerminal } from '../host/host-terminal.ts'
import { containerFor } from '../host/locate.ts'
import { hostProject } from '../host/project.ts'
import { SelectionView } from '../view/selection-view.ts'

/**
 * Builds the image, in a terminal whose process is `setup` itself.
 *
 * **Not a shell with a command typed into it.** `sendText` leaves the command as
 * editable text, gives no exit code, and makes a path with a space in it a
 * quoting problem. What is here instead is the script as the terminal's process,
 * with `/bin/sh` present for the single purpose of redirecting standard input —
 * see `composeAndBuildCommand`, which is where that reasoning lives.
 */
export async function build(
  write: (lines: string[]) => void,
  view: SelectionView,
  extensionPath: string,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    void vscode.window.showErrorMessage('Open a project folder first.')
    return
  }

  const checks = await hostChecks()
  const problems = hostProblems(checks)
  for (const problem of problems) {
    write([`build: ${problem.blocking ? 'refused' : 'warning'}: ${problem.message}`])
  }
  const blocker = problems.find((p) => p.blocking)
  if (blocker) {
    void vscode.window.showErrorMessage(blocker.message)
    return
  }

  const project = hostProject()
  if (project.kind === 'none') {
    write([`build: refused — ${project.reason}`])
    void vscode.window.showErrorMessage(`Build: ${project.reason}.`)
    return
  }
  const outcome = await buildInTerminal(project.path, extensionPath, write)
  view.recordBuild(outcome)
  // No notification on failure: the terminal holds the whole error, which is
  // where the cause is, and a popup saying "the build failed" has to be
  // dismissed before the useful text can be read.
  if (outcome === 'ok') await offerRecreate(project.path, write)
}

/**
 * After a good build: does the project's container still run the previous
 * image? See afterBuild for the decision; this reads docker and asks the user.
 * **It never removes a container**: the only action is Dev Containers' own
 * rebuild, when the person clicks it.
 */
export async function offerRecreate(hostPath: string, write: (lines: string[]) => void): Promise<void> {
  const image = projectNames(hostPath).image
  let built: string | undefined
  try {
    built = (await dockerBounded(['image', 'inspect', '-f', '{{.Id}}', image])).stdout.trim() || undefined
  } catch (error) {
    write([`build: could not read the image ${image} just built: ${String(error)}`])
  }

  let container: ContainerForImage = { kind: 'none' }
  try {
    const { stdout } = await dockerBounded([
      'ps', '-a', '--filter', 'label=devcontainer.local_folder',
      '--format', '{{.ID}}\t{{.Names}}\t{{.Label "devcontainer.local_folder"}}',
    ])
    const rows = stdout.split('\n').filter((l) => l.trim() !== '').map((l) => {
      const [id = '', name = '', localFolder = ''] = l.split('\t')
      return { id, name, localFolder }
    })
    const choice = containerFor(hostPath, rows)
    if (choice.kind === 'many') container = choice
    if (choice.kind === 'one') {
      const row = rows.find((r) => r.id === choice.id)!
      const { stdout: img } = await dockerBounded(['inspect', '-f', '{{.Image}}', choice.id])
      container = { kind: 'one', id: choice.id, name: row.name, image: img.trim() }
    }
  } catch (error) {
    write([`build: could not read the project's container: ${String(error)}`])
  }

  const decision = afterBuild({ built, container, inContainer: vscode.env.remoteName === 'dev-container' })
  if (decision.say === 'nothing') {
    void vscode.window.showInformationMessage('The image was built.')
    return
  }
  write([`build: ${decision.message}`])
  if (decision.say === 'ambiguous') {
    void vscode.window.showWarningMessage(decision.message)
    return
  }
  const available = (await vscode.commands.getCommands(true)).includes(decision.command)
  if (!available) {
    void vscode.window.showWarningMessage(
      `${decision.message} Dev Containers does not provide \`${decision.command}\` here: run "Dev Containers: Rebuild Container" from the Command Palette.`,
    )
    return
  }
  const recreate = 'Recreate container'
  if ((await vscode.window.showWarningMessage(decision.message, recreate)) === recreate) {
    write([`build: recreating through ${decision.command}`])
    await vscode.commands.executeCommand(decision.command)
  }
}

/**
 * Runs the build in a terminal and resolves with what it did.
 *
 * **Extracted rather than duplicated**, because the open now needs the same
 * thing: a project whose image is absent builds it and then attaches, and that
 * chain must read the outcome the same way the explicit build command does.
 * Two readings of one terminal's exit code is two ways to decide whether
 * somebody's project opens.
 *
 * The promise resolves when that terminal closes and never rejects: a closed
 * terminal with no exit code is a cancellation, which `buildOutcome` already
 * calls by name.
 */
export async function buildInTerminal(
  root: string,
  extensionPath: string,
  write: (lines: string[]) => void,
): Promise<'ok' | 'failed' | 'cancelled'> {
  const compose = composeForProject(extensionPath, root)
  const stacks = compose.stacks
  const dockerfileOut = join(tmpdir(), `${compose.image}.Dockerfile`)
  const { shellPath, shellArgs } = composeAndBuildCommand(compose, dockerfileOut)
  const pty = hostProcessTerminal(shellPath, shellArgs)
  const terminal = vscode.window.createTerminal({ name: 'Agent Container: build', pty })
  terminal.show()
  write([
    `build: composing from ${compose.script}`,
    `build: ${stacks.length} stack(s): ${stacks.join(', ') || '(none)'}`,
    `build: image ${compose.image}, context ${compose.context}`,
  ])

  // **The process's end, not the terminal's closing.** The terminal stays open
  // after the build so its output can be read (debt
  // a-refusal-is-gone-before-it-can-be-read); a run closed mid-way ends with no
  // code, which buildOutcome calls cancelled.
  const outcome = buildOutcome(await pty.exited)
  write([`build: ${outcome}`])
  return outcome
}
