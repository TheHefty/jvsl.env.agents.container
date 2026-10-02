import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import * as vscode from 'vscode'

import { formatDetected } from './diagnostics.ts'
import { hostFacts } from './host.ts'
import { CONFIG_PATH, decideOpen, REOPEN_COMMAND, type OpenContext } from './open.ts'
import {
  missingDependencies,
  nextManifest,
  stacksAvailable,
  versionsOf,
  type Answers,
} from './questions.ts'
import { readTemplateVersion } from './template.ts'

const CHANNEL_NAME = 'Dev Container Projects'
const SHOW_DETECTED = 'jvsl.devContainer.showDetected'
const OPEN = 'jvsl.devContainer.open'
const CONFIGURE = 'jvsl.devContainer.configure'
const MANIFEST = '.code-server.stack.json'

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
    vscode.commands.registerCommand(CONFIGURE, () => configure(write)),
  )

  write(await describe(context))
  await prepare(context, channel, write, { handOver: false })
}

/**
 * Asks the five questions and writes the manifest. Nothing else — the build is a
 * separate story, and this is useful without it because `setup` reads what this
 * writes.
 *
 * **Every decision in here is in `questions.ts`**, which is testable without an
 * editor. What is left is five calls and the rule that escaping any of them
 * writes nothing: a half-answered manifest is worse than none, because `setup`
 * would read it and build something nobody chose, successfully.
 */
async function configure(write: (lines: string[]) => void): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    void vscode.window.showErrorMessage('Open a project folder first.')
    return
  }
  const root = folder.uri.fsPath
  const stacksDir = join(root, '.code-server', 'stacks')

  const available = stacksAvailable(stacksDir)
  if (available.length === 0) {
    // The case that reads as a broken extension rather than a missing checkout.
    void vscode.window.showErrorMessage(
      'No stacks found in .code-server/stacks. If the submodule is not checked out yet, run: ' +
        'git submodule update --init',
    )
    write(['configure: refused, no stacks under ' + stacksDir])
    return
  }

  const manifestPath = join(root, MANIFEST)
  let current: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      current = parsed as Record<string, unknown>
    }
  } catch (error) {
    // Only a manifest that exists and cannot be read is a refusal; an absent one
    // is a project that has not been configured yet, which is the whole point.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      void vscode.window.showErrorMessage(
        `${MANIFEST} cannot be read, and rewriting it would lose whatever it holds. Fix it first.`,
      )
      return
    }
  }

  const selectedNow = available.filter((name) => name in current)
  const picked = await vscode.window.showQuickPick(available, {
    canPickMany: true,
    title: 'Which stacks does this project need?',
    placeHolder: 'Nothing selected builds the core image alone',
  })
  if (picked === undefined) return

  const [missing] = missingDependencies(picked, stacksDir)
  if (missing) {
    void vscode.window.showErrorMessage(
      `Stack '${missing.stack}' requires '${missing.needs}' — select it too.`,
    )
    return
  }

  const stacks: Record<string, string> = {}
  for (const stack of picked) {
    const versions = versionsOf(stacksDir, stack)
    const recorded = typeof current[stack] === 'string' ? (current[stack] as string) : undefined
    const ordered = recorded ? [recorded, ...versions.filter((v) => v !== recorded)] : versions
    const version = await vscode.window.showQuickPick(ordered, {
      title: `Which version of ${stack}?`,
    })
    if (version === undefined) return
    stacks[stack] = version
  }

  const limitsNow = (current.limits ?? {}) as Record<string, unknown>
  const memory = await ask('Memory the container may use', String(limitsNow.memory ?? '6g'))
  if (memory === undefined) return
  const swap = await ask('Memory plus swap, empty to derive memory + 2g', String(limitsNow.memorySwap ?? ''))
  if (swap === undefined) return
  const cpus = await ask("Cores to pin, empty for half the host's", String(limitsNow.cpus ?? ''))
  if (cpus === undefined) return

  const answers: Answers = {
    stacks,
    limits: {
      memory,
      ...(swap ? { memorySwap: swap } : {}),
      ...(cpus ? { cpus: Number(cpus) } : {}),
    },
  }

  const next = nextManifest(current, answers, available)
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  write([
    `configure: wrote ${MANIFEST}`,
    `  stacks before: ${selectedNow.join(' ') || '(none)'}`,
    `  stacks after:  ${picked.join(' ') || '(none)'}`,
    '  the image is not rebuilt by this command; run .code-server/setup',
  ])
  void vscode.window.showInformationMessage(
    `${MANIFEST} written. Run .code-server/setup to rebuild the image.`,
  )
}

/** An input box whose undefined means escape, which the caller treats as abandon. */
async function ask(title: string, value: string): Promise<string | undefined> {
  return vscode.window.showInputBox({ title, value })
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
