import { unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as vscode from 'vscode'

import { hostProblems, sandboxWarnings } from '../build/build.ts'
import { hostChecks, sandboxConditions } from '../host/checks.ts'
import { describe, extensionVersion } from '../host/detected.ts'
import { hostProject, readOrNull } from '../host/project.ts'
import { projectContainer } from '../build/command.ts'
import { dockerFor } from '../host/docker.ts'
import { prepare } from './command.ts'
import { HANDOVER_KEY, startupAction } from './handover.ts'
import { olderCopyNotice } from './older-copy.ts'
import { MANIFEST, LEGACY_MANIFEST, resolveManifest } from '../shared/stack-manifest.ts'
import { filesFor } from '../host/files.ts'
import { CONFIG_PATH, REOPEN_COMMAND } from './open.ts'
import { afterRegenerate, staleness } from './stale.ts'
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
    const blocker = hostProblems(await hostChecks(), process.platform).find((p) => p.blocking)
    view.recordHostProblem(blocker?.message)
    return
  }

  // **Before `prepare`, and that is the whole of "resolved once".** Adoption
  // renames the file, so every read after this point finds one name on disk.
  // **Activation writes nothing unless Open or Create asked** (story
  // opening-a-folder-writes-nothing). `code <folder>` used to rename an old
  // manifest and write .devcontainer, CLAUDE.md and AGENTS.md here. The record
  // is consumed whatever it says, so a stale one cannot act later.
  const project = hostProject()
  const handedOver = context.globalState.get(HANDOVER_KEY)
  if (handedOver !== undefined) await context.globalState.update(HANDOVER_KEY, undefined)
  const folder = project.kind === 'host' ? project.path : undefined
  if (startupAction(handedOver, folder, Date.now()) !== 'prepare') {
    write(['open flow: nothing written: this folder was opened, not asked to be prepared. Open in container, from the panel, prepares it.'])
    offerRegeneration(context, channel, write, project)
    return
  }
  if (project.kind === 'host') adoptManifest(project.path, write)

  await prepare(context, channel, write, { handOver: true })
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

/**
 * Regenerate: the configuration rewritten, then taken to the container (debt
 * regenerate-reopens-the-window-but-the-container-keeps-its-old-configuration).
 * A reopen alone reattaches to the existing container, which keeps its old
 * configuration, so with a container the rebuild is asked for — never run
 * unasked, since recreating ends what runs inside. See afterRegenerate.
 */
async function regenerate(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
  write: (lines: string[]) => void,
  project: Exclude<ReturnType<typeof hostProject>, { kind: 'none' }>,
): Promise<void> {
  if ((await prepare(context, channel, write, { handOver: false })) !== 'written') return
  const container = await projectContainer(project, dockerFor(project), (why) => write([`configuration: ${why}`]))
  const next = afterRegenerate({ container, inContainer: vscode.env.remoteName === 'dev-container' })
  if (next.say === 'reopen') {
    await vscode.commands.executeCommand(REOPEN_COMMAND)
    return
  }
  write([`configuration: ${next.message}`])
  if (next.say === 'ambiguous') {
    void vscode.window.showWarningMessage(next.message)
    return
  }
  const waits = 'configuration: the rewritten configuration waits for the container to be recreated: ' +
    'run "Dev Containers: Rebuild Container" when nothing is running in it'
  if (!(await vscode.commands.getCommands(true)).includes(next.command)) {
    write([waits])
    void vscode.window.showWarningMessage(
      `${next.message} Dev Containers does not provide \`${next.command}\` here: run "Dev Containers: Rebuild Container" from the Command Palette.`,
    )
    return
  }
  const recreate = 'Recreate container'
  if ((await vscode.window.showWarningMessage(next.message, recreate)) === recreate) {
    write([`configuration: recreating through ${next.command}`])
    await vscode.commands.executeCommand(next.command)
    return
  }
  write([waits])
}

/**
 * A configuration an older extension generated, said once with an action, and
 * written only if it is chosen (debt
 * a-projects-generated-container-configuration-does-not-follow-an-upgraded-extension).
 * Reads the file through the project's own files, so a WSL project is read
 * through the distro; never throws, because nothing here is worth stopping
 * startup for.
 */
function offerRegeneration(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
  write: (lines: string[]) => void,
  project: ReturnType<typeof hostProject>,
): void {
  if (project.kind === 'none') return
  try {
    const s = staleness(filesFor(project).read(CONFIG_PATH), extensionVersion(context))
    if (!s.stale) return
    write([`configuration: ${s.message}`])
    void vscode.window.showInformationMessage(s.message, 'Regenerate').then((choice) => {
      if (choice !== 'Regenerate') return
      write(['configuration: regenerating, as asked'])
      return regenerate(context, channel, write, project)
    })
  } catch (error) {
    write([`configuration: could not be checked for a newer generation: ${String(error)}`])
  }
}
