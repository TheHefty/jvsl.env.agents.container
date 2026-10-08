import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as vscode from 'vscode'

import { carried } from '../build/template.ts'
import { configure, ask, askAnswers } from '../configure/command.ts'
import { stacksAvailable } from '../configure/questions.ts'
import { decideCreate, type Applied } from './create.ts'
import { checkLocation } from './location.ts'
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
export async function create(write: (lines: string[]) => void, extensionPath: string): Promise<void> {
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
  const root = picked?.[0]?.fsPath
  if (root === undefined) return

  const location = checkLocation(root)
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
  const applied = plan.refused === undefined ? apply(root, plan.writes, write) : undefined
  const decision = decideCreate({ plan, applied })

  write([`create: ${decision.message}`])
  if (!decision.open) {
    void vscode.window.showWarningMessage(decision.message)
    return
  }
  // Shown rather than only written, because "the files are there and the
  // history is empty" is otherwise found at somebody's next `git log`.
  if (!plan.commit) void vscode.window.showInformationMessage(decision.message)

  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), {
    forceNewWindow: vscode.workspace.workspaceFolders !== undefined,
  })
}

/** Applies a plan, reporting both halves rather than throwing on the first failure. */
export function apply(root: string, writes: { path: string; contents: string }[],
               write: (lines: string[]) => void): Applied {
  const written: string[] = []
  const failed: string[] = []
  for (const w of writes) {
    try {
      const target = join(root, w.path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, w.contents, 'utf8')
      written.push(w.path)
    } catch (error) {
      write([`create: could not write ${w.path}: ${String(error)}`])
      failed.push(w.path)
    }
  }
  return { written, failed }
}

export async function askAiMemory(): Promise<boolean> {
  const answer = await vscode.window.showQuickPick(['No', 'Yes'], {
    title: 'Should this project record what the agent was told?',
    placeHolder: 'ai-memory: off unless asked for. Captured to disk, on this machine, per project.',
  })
  return answer === 'Yes'
}
