import * as vscode from 'vscode'

import { hostFacts } from './host.ts'
import { formatDetected } from './diagnostics.ts'
import { readTemplateVersion } from './template.ts'

const CHANNEL_NAME = 'Dev Container Projects'
const SHOW_DETECTED = 'jvsl.devContainer.showDetected'

/**
 * The extension's whole job for now: wake up on a project built on this
 * template, work out what it is looking at, and write that down.
 *
 * It opens nothing. Generating the dev container configuration and handing over
 * to the container tooling is the next task; refusing a project that cannot be
 * opened is the story after it. What this delivers is the thing both of those
 * need and neither would otherwise get: a record of the inputs, written before
 * any decision is made from them.
 *
 * **Activation is declared on `.code-server.stack.json`**, the manifest at the
 * project root, and not on anything inside `.code-server/`. A clone without
 * `--recursive` leaves that directory existing and empty, so an activation
 * event naming a path inside it never fires — in exactly the case a project
 * most needs to be told something.
 */
export function activate(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel(CHANNEL_NAME)
  context.subscriptions.push(channel)

  const report = (): string[] => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (root === undefined) {
      return ['no folder is open, so there is no project to describe']
    }
    return [
      `project: ${root}`,
      ...formatDetected({
        templateVersion: readTemplateVersion(root),
        templateMinVersion: templateMinVersion(context),
        facts: hostFacts(),
        // `vscode.env.remoteName` is undefined exactly when the extension host
        // is local. Reported rather than assumed: the manifest asks for "ui",
        // and a wrong answer here is silent in a way that matters — see
        // formatDetected.
        runningOnHost: vscode.env.remoteName === undefined,
      }),
    ]
  }

  const write = (lines: string[]): void => {
    channel.appendLine(`--- ${new Date().toISOString()}`)
    for (const line of lines) channel.appendLine(line)
  }

  write(report())

  context.subscriptions.push(
    vscode.commands.registerCommand(SHOW_DETECTED, () => {
      write(report())
      channel.show(true)
    }),
  )
}

export function deactivate(): void {
  // Nothing to undo: the channel is disposed through context.subscriptions.
}

/**
 * Read from the extension's own manifest rather than hardcoded, so the value a
 * tool can see in package.json is the value the code uses. Falls back to the
 * literal only if the field has been removed, which the manifest test forbids.
 */
function templateMinVersion(context: vscode.ExtensionContext): string {
  const declared = (context.extension?.packageJSON as { templateMinVersion?: unknown } | undefined)
    ?.templateMinVersion
  return typeof declared === 'string' ? declared : 'unknown'
}
