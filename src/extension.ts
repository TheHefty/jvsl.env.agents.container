import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import * as vscode from 'vscode'

import { formatDetected } from './diagnostics.ts'
import { hostFacts } from './host.ts'
import { CONFIG_PATH, decideOpen, REOPEN_COMMAND, type OpenContext } from './open.ts'
import { readTemplateVersion } from './template.ts'

const CHANNEL_NAME = 'Dev Container Projects'
const SHOW_DETECTED = 'jvsl.devContainer.showDetected'
const OPEN = 'jvsl.devContainer.open'

const run = promisify(execFile)

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
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const channel = vscode.window.createOutputChannel(CHANNEL_NAME)
  context.subscriptions.push(channel)

  const write = (lines: string[]): void => {
    channel.appendLine(`--- ${new Date().toISOString()}`)
    for (const line of lines) channel.appendLine(line)
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(SHOW_DETECTED, async () => {
      write(await describe(context))
      channel.show(true)
    }),
    // For whoever dismissed the tooling's notification, or wants it again
    // without reloading. Same decision, and it also hands over.
    vscode.commands.registerCommand(OPEN, () => prepare(context, channel, write, { handOver: true })),
  )

  write(await describe(context))
  await prepare(context, channel, write, { handOver: false })
}

export function deactivate(): void {
  // Nothing to undo: the channel is disposed through context.subscriptions.
}

/**
 * Decides, writes, and says what needs saying. `handOver` is the difference
 * between activation — which leaves the asking to the tooling — and the command,
 * which was invoked precisely because somebody wants it open now.
 */
async function prepare(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
  write: (lines: string[]) => void,
  options: { handOver: boolean },
): Promise<void> {
  const root = workspaceRoot()
  if (root === undefined) return

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

  // Shown because the tooling's own notification cannot say any of it, and the
  // alternative is a project that opens with limits nobody asked for.
  for (const note of decision.notes) {
    void vscode.window.showWarningMessage(note)
  }

  if (options.handOver) {
    await vscode.commands.executeCommand(REOPEN_COMMAND)
  }
}

async function gather(
  root: string,
  context: vscode.ExtensionContext,
  write: (lines: string[]) => void,
): Promise<OpenContext> {
  return {
    projectRoot: root,
    homeDir: homedir(),
    extensionVersion: extensionVersion(context),
    facts: hostFacts(),
    manifest: readOrNull(join(root, '.code-server.stack.json')),
    existingConfig: readOrNull(join(root, CONFIG_PATH)),
    runningContainers: await runningContainers(write),
    reopenCommandAvailable: (await vscode.commands.getCommands(true)).includes(REOPEN_COMMAND),
    gitignore: readOrNull(join(root, '.gitignore')),
  }
}

/**
 * Names of running containers. A runtime that cannot be reached yields none:
 * refusing on that is FR-24, which belongs to the story that owns every
 * refusal, and guessing it here would duplicate that message badly. It is
 * written to the channel so the next failure is not a surprise.
 */
async function runningContainers(write: (lines: string[]) => void): Promise<string[]> {
  try {
    const { stdout } = await run('docker', ['ps', '--format', '{{.Names}}'])
    return stdout.split('\n').map((n) => n.trim()).filter((n) => n !== '')
  } catch (error) {
    write([`could not list running containers: ${String(error)}`])
    return []
  }
}

async function describe(context: vscode.ExtensionContext): Promise<string[]> {
  const root = workspaceRoot()
  if (root === undefined) return ['no folder is open, so there is no project to describe']
  return [
    `project: ${root}`,
    ...formatDetected({
      templateVersion: readTemplateVersion(root),
      templateMinVersion: templateMinVersion(context),
      facts: hostFacts(),
      // Undefined exactly when the extension host is local. Reported rather
      // than assumed: from the remote host every number above describes the
      // container, and a limit computed from them would be wrong without
      // failing.
      runningOnHost: vscode.env.remoteName === undefined,
    }),
  ]
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function packageJSON(context: vscode.ExtensionContext): Record<string, unknown> {
  return (context.extension?.packageJSON ?? {}) as Record<string, unknown>
}

function templateMinVersion(context: vscode.ExtensionContext): string {
  const declared = packageJSON(context)['templateMinVersion']
  return typeof declared === 'string' ? declared : 'unknown'
}

function extensionVersion(context: vscode.ExtensionContext): string {
  const declared = packageJSON(context)['version']
  return typeof declared === 'string' ? declared : '0.0.0'
}
