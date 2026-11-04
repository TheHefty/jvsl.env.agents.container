import * as vscode from 'vscode'

import { hostProblems, sandboxWarnings } from '../build/build.ts'
import { hostChecks, sandboxConditions } from '../host/checks.ts'
import { describe, extensionVersion } from '../host/detected.ts'
import { hostProject } from '../host/project.ts'
import { projectContainer } from '../build/command.ts'
import { findGradleBuildsFor, gradleVersion } from '../build/gradle.ts'
import { dockerFor } from '../host/docker.ts'
import { prepare } from './command.ts'
import { HANDOVER_KEY, handoverFolder, startupAction } from './handover.ts'
import { olderCopyNotice } from './older-copy.ts'
import { MANIFEST } from '../shared/stack-manifest.ts'
import { filesFor } from '../host/files.ts'
import { CONFIG_PATH, REOPEN_COMMAND } from './open.ts'
import { afterRegenerate, staleness } from './stale.ts'
import { WAYLAND_SETTING, waylandWorkaround } from '../host/wayland.ts'
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

  // **Activation writes nothing unless Open or Create asked** (story
  // opening-a-folder-writes-nothing). `code <folder>` used to rename an old
  // manifest and write .devcontainer, CLAUDE.md and AGENTS.md here. The record
  // is consumed whatever it says, so a stale one cannot act later.
  const project = hostProject()
  // Before anything opens, ours or Dev Containers' own Reopen (debt chf).
  await turnOffWaylandMount(project, write)
  const handedOver = context.globalState.get(HANDOVER_KEY)
  if (handedOver !== undefined) await context.globalState.update(HANDOVER_KEY, undefined)
  const folder = handoverFolder(project)
  if (startupAction(handedOver, folder, Date.now()) !== 'prepare') {
    write(['open flow: nothing written: this folder was opened, not asked to be prepared. Open in container, from the panel, prepares it.'])
    offerRegeneration(context, channel, write, project)
    offerGradleNotice(context, write, project)
    return
  }
  await prepare(context, channel, write, { handOver: true })
}

export function watchManifest(onChange: () => void): vscode.Disposable {
  // A manifest created, edited or removed by hand afterwards would otherwise
  // leave every later read describing a project that is not there any more,
  // and the symptom is silent defaults — limits nobody chose, applied with no
  // error.
  const watchers = [MANIFEST].map((name) => {
    const watcher = vscode.workspace.createFileSystemWatcher(`**/${name}`)
    watcher.onDidChange(onChange)
    watcher.onDidCreate(onChange)
    watcher.onDidDelete(onChange)
    return watcher
  })
  return { dispose: () => { for (const w of watchers) w.dispose() } }
}

/**
 * Dev Containers' Wayland mount, turned off on Windows so a project there opens
 * through Docker Desktop (debt chf). See waylandWorkaround for when. Never
 * throws: a setting that cannot be read or written is said, not fatal.
 */
async function turnOffWaylandMount(project: ReturnType<typeof hostProject>, write: (lines: string[]) => void): Promise<void> {
  try {
    const config = vscode.workspace.getConfiguration('dev.containers')
    const decision = waylandWorkaround({ platform: process.platform, project, setting: config.inspect(WAYLAND_SETTING) })
    if (decision.action === 'leave') return
    write([`host: ${decision.message}`])
    if (decision.action === 'warn') return
    await config.update(WAYLAND_SETTING, false, vscode.ConfigurationTarget.Global)
    void vscode.window.showInformationMessage(decision.message)
  } catch (error) {
    write([`host: Dev Containers' Wayland mount could not be checked or turned off: ${String(error)}`])
  }
}

/** Where the warnings already shown for this project are remembered. */
export const GRADLE_NOTICE_KEY = 'jvsl.agentContainer.gradleNoticesShown'

/**
 * A Gradle build with no wrapper, said in a window that was only opened (debt
 * rjj, task rjj.3). prepare says it as a note, but opening an existing project
 * does not prepare, so the warning never reached the project it was found in.
 * The channel has it on every open; the notification **once per project and
 * per text**, so it is neither repeated until it is dismissed unread nor
 * silent when the builds change. Never throws: nothing here is worth stopping
 * startup for.
 */
function offerGradleNotice(
  context: vscode.ExtensionContext,
  write: (lines: string[]) => void,
  project: ReturnType<typeof hostProject>,
): void {
  if (project.kind === 'none') return
  try {
    const scan = findGradleBuildsFor(project, filesFor(project))
    const gradle = gradleVersion(scan.builds)
    write([...scan.log, ...gradle.log])
    const shown = context.workspaceState.get<string[]>(GRADLE_NOTICE_KEY) ?? []
    const fresh = gradle.warnings.filter((w) => !shown.includes(w))
    for (const w of gradle.warnings) write([`gradle: warning: ${w}`])
    if (fresh.length === 0) return
    for (const w of fresh) void vscode.window.showWarningMessage(w)
    void context.workspaceState.update(GRADLE_NOTICE_KEY, gradle.warnings)
  } catch (error) {
    write([`gradle: the project's builds could not be checked for a missing wrapper: ${String(error)}`])
  }
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
