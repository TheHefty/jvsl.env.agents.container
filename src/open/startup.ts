import { unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as vscode from 'vscode'

import { hostProblems, sandboxWarnings } from '../build/build.ts'
import { hostChecks, sandboxConditions } from '../host/checks.ts'
import { describe } from '../host/detected.ts'
import { hostProject, readOrNull } from '../host/project.ts'
import { prepare } from './command.ts'
import { olderCopyNotice } from './older-copy.ts'
import { MANIFEST, LEGACY_MANIFEST, resolveManifest } from '../shared/stack-manifest.ts'
import { SelectionView } from '../view/selection-view.ts'

/**
 * Everything activation does after the commands exist, none of it awaited by
 * activate() itself.
 */
export async function startup(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
  write: (lines: string[]) => void,
  view: SelectionView,
): Promise<void> {
  // A sentence; the commands are the product. FR-115 says this notice blocks
  // nothing, and being unable to break anything is the stronger form of that.
  // It sat inside the Show What Was Detected callback from #110 until here: a
  // text replacement matched the indented copy of the line it was aimed at, so
  // the notice appeared only when somebody asked to see what was detected.
  try {
    const older = olderCopyNotice(vscode.extensions.all.map((e) => e.id))
    if (older !== undefined) {
      write([`older copy: ${older}`])
      void vscode.window.showWarningMessage(older)
    }
  } catch (error) {
    write([`older copy: could not be checked: ${String(error)}`])
  }

  write(describe(context))

  // **Activation runs in every window on this host**, because the panel has to
  // exist before anybody asks for it. What keeps the cost the SRS accepted is
  // that a window with no folder pays a registration and one host check.
  // **The agents' sandbox, said in the panel** (the debt
  // the-sandbox-under-apparmor). Not awaited by anything the commands wait on:
  // it reads docker and /proc, and the panel fills in when it answers.
  void sandboxConditions().then((c) => {
    const warnings = sandboxWarnings(c)
    for (const w of warnings) write([`host: warning: ${w.message}`])
    view.recordSandboxWarning(warnings.length === 0 ? undefined : warnings.map((w) => w.message).join(' '))
  })

  if (vscode.workspace.workspaceFolders === undefined) {
    const blocker = hostProblems(await hostChecks()).find((p) => p.blocking)
    view.recordHostProblem(blocker?.message)
    return
  }

  // **Before `prepare`, and that is the whole of "resolved once".** Adoption
  // renames the file, so every read after this point finds one name on disk.
  const project = hostProject()
  if (project.kind === 'host') adoptManifest(project.path, write)

  await prepare(context, channel, write, { handOver: false })
}

/**
 * Which manifest this project has, settled once, by renaming an older one.
 *
 * **The order is not negotiable and it is the task's first failure scenario.**
 * Write the new file, read it back, compare it against what was parsed, and only
 * then unlink. A half-completed rename can leave a project with *neither* name —
 * and the extension does not wake for such a project, so the damage and the
 * inability to report it would arrive together.
 *
 * The decision itself is `resolveManifest`, which is pure and tested without a
 * filesystem. Everything dangerous is here.
 */
export function adoptManifest(root: string, write: (lines: string[]) => void): void {
  const currentPath = join(root, MANIFEST)
  const legacyPath = join(root, LEGACY_MANIFEST)
  const resolution = resolveManifest({
    current: readOrNull(currentPath),
    legacy: readOrNull(legacyPath),
  })

  if (resolution.action === 'none' || resolution.action === 'use-current') return

  if (resolution.action === 'keep-both' || resolution.action === 'leave-unreadable') {
    write([`manifest: ${resolution.note}`])
    void vscode.window.showWarningMessage(resolution.note)
    return
  }

  try {
    writeFileSync(currentPath, resolution.contents, 'utf8')
    if (readOrNull(currentPath) !== resolution.contents) {
      const cause =
        `\`${MANIFEST}\` was written but did not read back identical, so \`${LEGACY_MANIFEST}\` ` +
        `was left exactly where it is. Nothing was deleted.`
      write([`manifest: ${cause}`])
      void vscode.window.showWarningMessage(cause)
      return
    }
    unlinkSync(legacyPath)
  } catch (error) {
    const cause =
      `\`${LEGACY_MANIFEST}\` could not be adopted: ${String(error)}. Nothing was deleted.`
    write([`manifest: ${cause}`])
    void vscode.window.showWarningMessage(cause)
    return
  }

  write([`manifest: ${resolution.note}`])
  void vscode.window.showInformationMessage(resolution.note)
}

export function watchManifest(onChange: () => void): vscode.Disposable {
  // **Both names, because the resolved one can stop being the answer.** The name
  // is settled once at activation; a manifest created, renamed or removed by
  // hand afterwards would otherwise leave every later read pointing at a path
  // that no longer describes the project, and the symptom is silent defaults —
  // limits nobody chose, applied with no error.
  const watchers = [MANIFEST, LEGACY_MANIFEST].map((name) => {
    const watcher = vscode.workspace.createFileSystemWatcher(`**/${name}`)
    watcher.onDidChange(onChange)
    watcher.onDidCreate(onChange)
    watcher.onDidDelete(onChange)
    return watcher
  })
  return { dispose: () => { for (const w of watchers) w.dispose() } }
}
