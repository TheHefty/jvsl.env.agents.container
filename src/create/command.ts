import * as vscode from 'vscode'

import { carried } from '../build/template.ts'
import { askAnswers } from '../configure/command.ts'
import { stacksAvailable } from '../configure/questions.ts'
import { filesFor } from '../host/files.ts'
import { pickedProject } from '../host/locate.ts'
import { apply } from './apply.ts'
import { decideCreate } from './create.ts'
import { checkLocation, checkLocationIn } from './location.ts'
import { scaffoldPlan } from './scaffold.ts'

/**
 * Creating a project: ask, write, commit, open.
 *
 * **It decides nothing.** The location's usability is `checkLocation`, what goes
 * in the directory is `scaffoldPlan`, and whether the folder opens is
 * `decideCreate` — because `showOpenDialog`, `openFolder` and `git` cannot be
 * exercised in a test and everything around them can.
 *
 * The handoff into the container is not here either: a scaffolded project has a
 * manifest and no image, so activation in the new window builds it and attaches.
 */
export async function create(
  write: (lines: string[]) => void,
  extensionPath: string,
  handOver: (folder: string) => Thenable<void>,
): Promise<void> {
  // **Location first**, because it is the only answer that can be refused
  // outright — asking the stacks first means answering six questions before
  // being told the directory will not do.
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Create the Project Here',
    title: 'An empty directory, or one that does not exist yet',
  })
  // **The picked address, kept whole** (debt ck8): from a WSL window it names a
  // folder in the distro, and its fsPath alone names one on the Windows disk.
  const uri = picked?.[0]
  if (uri === undefined) return
  const project = pickedProject(uri)
  if (project.kind === 'none') {
    write([`create: refused — ${project.reason}`])
    void vscode.window.showWarningMessage(`Create: ${project.reason}.`)
    return
  }
  const root = project.path
  const files = filesFor(project)

  const location = project.kind === 'host' ? checkLocation(root) : checkLocationIn(files, root)
  if (!location.usable) {
    write([`create: refused — ${location.because ?? 'the location will not do'}`])
    void vscode.window.showWarningMessage(location.because ?? 'That location will not do.')
    return
  }

  // **The answers, without the write.** `configure` asks and writes in one pass,
  // which is right when the manifest is the only thing changing and wrong here:
  // it would write the manifest into the directory and then `scaffoldPlan`'s
  // empty check would refuse what it had just created.
  const stacksDir = carried(extensionPath, 'stacks')
  const asked = await askAnswers(stacksDir, stacksAvailable(stacksDir), {})
  if (asked === undefined) {
    write([`create: ${decideCreate({ plan: undefined, applied: undefined }).message}`])
    return
  }
  const answers = { ...asked, location: root, aiMemory: await askAiMemory() }
  const plan = scaffoldPlan({ root, assetsDir: carried(extensionPath, 'assets', 'project'), answers })
  const applied = plan.refused === undefined ? apply(files, plan.writes, write) : undefined
  const decision = decideCreate({ plan, applied })

  write([`create: ${decision.message}`])
  if (!decision.open) {
    void vscode.window.showWarningMessage(decision.message)
    return
  }
  // Shown rather than only written, because "the files are there and the
  // history is empty" is otherwise found at somebody's next `git log`.
  if (!plan.commit) void vscode.window.showInformationMessage(decision.message)

  // The new window prepares the project because this asked: activation alone
  // writes nothing (story opening-a-folder-writes-nothing).
  await handOver(root)
  await vscode.commands.executeCommand('vscode.openFolder', uri, {
    forceNewWindow: vscode.workspace.workspaceFolders !== undefined,
  })
}

export async function askAiMemory(): Promise<boolean> {
  const answer = await vscode.window.showQuickPick(['No', 'Yes'], {
    title: 'Should this project record what the agent was told?',
    placeHolder: 'ai-memory: off unless asked for. Captured to disk, on this machine, per project.',
  })
  return answer === 'Yes'
}
