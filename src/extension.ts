import * as vscode from 'vscode'

import { showWork } from './board/board.ts'
import { build } from './build/command.ts'
import { SHOW_DETECTED, OPEN, CONFIGURE, BUILD, SHOW_WORK, MIGRATE, PICK, CREATE, VIEW } from './commands.ts'
import { configure, pick } from './configure/command.ts'
import { create } from './create/command.ts'
import { showDetected } from './host/detected.ts'
import { dockerBounded } from './host/docker.ts'
import { migrate } from './migrate/command.ts'
import { prepare } from './open/command.ts'
import { startup, watchManifest } from './open/startup.ts'
import { SelectionView } from './view/selection-view.ts'

const CHANNEL_NAME = 'Dev Container Projects'

/**
 * Wakes up on a project built on this template, writes the configuration the
 * container tooling needs, and gets out of the way.
 *
 * **It does not do the asking.** The tooling shows its own "Reopen in
 * Container" notification once a configuration exists, and none of its settings
 * can suppress it — so on the happy path the file is written quietly and that
 * notification is the only one. This extension speaks only when there is
 * something the native one cannot say: a refusal, or a degraded open.
 *
 * **Activation is declared on `.code-server.stack.json`**, the manifest at the
 * project root, never on a path inside `.code-server/`. A clone without
 * `--recursive` leaves that directory existing and empty, so an event naming
 * anything inside it never fires — in exactly the case a project most needs to
 * be told something.
 */
// activate() awaits nothing by design (activate-returns-promptly.test.sh holds
// it to that), and stays async because that guard and commands-register-first
// read this exact shape.
// eslint-disable-next-line @typescript-eslint/require-await
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const channel = vscode.window.createOutputChannel(CHANNEL_NAME)
  context.subscriptions.push(channel)

  const write = (lines: string[]): void => {
    channel.appendLine(`--- ${new Date().toISOString()}`)
    for (const line of lines) channel.appendLine(line)
  }

  // Declared before the commands that close over it: the closure would resolve
  // either way, but a reader should not have to know that to be sure.
  const view = new SelectionView(context.extensionPath)

  context.subscriptions.push(
    vscode.commands.registerCommand(SHOW_DETECTED, () => showDetected(context, channel, write)),
    // For whoever dismissed the tooling's notification, or wants it again
    // without reloading. Same decision, and it also hands over.
    vscode.commands.registerCommand(OPEN, () => prepare(context, channel, write, { handOver: true })),
    vscode.commands.registerCommand(CREATE, () => create(write, context.extensionPath)),
    vscode.commands.registerCommand(PICK, () => pick(write, view, context.extensionPath)),
    vscode.commands.registerCommand(CONFIGURE, () => configure(write, view, context.extensionPath)),
    vscode.commands.registerCommand(BUILD, () => build(write, view, context.extensionPath)),
    vscode.commands.registerCommand(SHOW_WORK, () => showWork(dockerBounded, write)),
    vscode.commands.registerCommand(MIGRATE, () => migrate(write, () => channel.show(true))),
  )

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(VIEW, view),
    // External edits count: the manifest is a file a person may change by hand,
    // and a view that only updates when this extension writes it would be
    // confidently wrong rather than merely stale.
    watchManifest(() => view.refresh()),
  )

  // **Started, never awaited, and that is what lets the commands work.** The
  // editor waits for activation to finish before it dispatches a command, so
  // anything activate() awaits is something every command waits behind. This
  // used to await the open flow, which awaits a notification being clicked, a
  // build in a terminal finishing, and a reopen — and the extension sat at
  // "Activating…" while every palette entry answered "not found".
  // scripts/activate-returns-promptly.test.sh holds activate() to no await.
  void startup(context, channel, write, view).catch((error: unknown) => {
    write([`startup failed: ${String(error)}`])
  })
}

export function deactivate(): void {
  // Nothing to undo: the channel is disposed through context.subscriptions.
}
