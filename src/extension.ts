import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import * as vscode from 'vscode'

import {
  composeAndBuildCommand,
  handsOver,
  composeCommand,
  buildOutcome,
  detectManager,
  hostProblems,
  sandboxWarnings,
  afterBuild,
  type ContainerForImage,
  type SandboxConditions,
  type DockerState,
  type HostChecks,
} from './build/build.ts'
import { configureOutcome, type ConfigureResult } from './configure/configure.ts'
import { decideCreate, type Applied } from './create/create.ts'
import { aiMemoryMarker, checkLocation } from './create/location.ts'
import { scaffoldPlan } from './create/scaffold.ts'
import { projectNames } from './build/devcontainer.ts'
import { formatDetected } from './host/diagnostics.ts'
import { hostFacts } from './host/host.ts'
import { MANIFEST, LEGACY_MANIFEST, resolveManifest } from './shared/stack-manifest.ts'
import { olderCopyNotice } from './open/older-copy.ts'
import { showWork } from './board.ts'
import { applyFileMigration, carriesTemplateSubmodule, planFileMigration, textsWorthReading } from './migrate/migrate-files.ts'
import { migrationStep, planMarkdown, type MigrationFacts } from './migrate/migrate-step.ts'
import { containerFor, projectOnHost, type ProjectOnHost } from './host/locate.ts'
import { CONFIG_PATH, decideOpen, prepareHere, REOPEN_COMMAND, type OpenContext, type ImageState } from './open/open.ts'
import { viewItems, type Row, type ViewState } from './view.ts'
import {
  limitDefaults,
  missingDependencies,
  nextManifest,
  orderedVersions,
  stacksAvailable,
  versionsOf,
  type Answers,
} from './configure/questions.ts'
import { instructionWrites } from './configure/instructions.ts'
import { decidePick } from './configure/pick.ts'
import { carried } from './build/template.ts'
import { hostProcessTerminal } from './host/host-terminal.ts'

const CHANNEL_NAME = 'Dev Container Projects'
const SHOW_DETECTED = 'jvsl.agentContainer.showDetected'
/** Never contributed, so never in the palette: registered so the open flow can be run again by id. */
const OPEN = 'jvsl.agentContainer.prepare'
const CONFIGURE = 'jvsl.agentContainer.configure'
const BUILD = 'jvsl.agentContainer.build'
const SHOW_WORK = 'jvsl.agentContainer.showWork'
const MIGRATE = 'jvsl.agentContainer.migrate'
/** Bounded because `docker info` hangs on an unreachable daemon rather than failing. */
const DOCKER_CHECK_MS = 2000
const PICK = 'jvsl.agentContainer.open'
const CREATE = 'jvsl.agentContainer.create'
const VIEW = 'jvsl.agentContainer.view'

const run = promisify(execFile)

/**
 * Every call to docker, bounded.
 *
 * **An unbounded one hangs activation, and a hung activation is every command
 * reporting that it does not exist.** `docker info` was raced against a timeout
 * because it "hangs on an unreachable daemon rather than failing"; `image
 * inspect`, `version` and `ps` were not, and three of the four run inside the
 * path `activate` awaits. On 2026-10-06 the editor sat at `Activating…` for
 * ever while every palette entry answered `command 'jvsl.agentContainer.build'
 * not found` — which is what it says when it activates an extension to dispatch
 * a command and the activation never finishes.
 *
 * **One helper rather than a race at each call site.** The previous arrangement
 * had the race written out once, three lines from a call that did not get one.
 * A mechanism applied where somebody remembered is not a mechanism, and
 * `scripts/no-unbounded-docker-call.test.sh` now refuses any call that does not
 * come through here.
 *
 * It rejects on timeout rather than resolving, so callers keep the `catch` they
 * already had and a slow daemon reads as a daemon that did not answer — which
 * is what it is.
 */
async function dockerBounded(args: string[], ms = DOCKER_CHECK_MS): Promise<{ stdout: string; stderr: string }> {
  return Promise.race([
    // 64 MiB of output: execFile's default is 1 MiB, and a whole tracker read
    // by the board can pass that, failing as "maxBuffer exceeded".
    run('docker', args, { maxBuffer: 64 * 1024 * 1024 }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ])
}

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
    vscode.commands.registerCommand(MIGRATE, () => migrate(write)),
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

async function showDetected(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
  write: (lines: string[]) => void,
): Promise<void> {
  write(await describe(context))
  channel.show(true)
}

/**
 * Everything activation does after the commands exist, none of it awaited by
 * activate() itself.
 */
async function startup(
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

  write(await describe(context))

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
  if (project.kind === 'host') await adoptManifest(project.path, write)

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
async function adoptManifest(root: string, write: (lines: string[]) => void): Promise<void> {
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

function watchManifest(onChange: () => void): vscode.Disposable {
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
 * The sidebar view. **Every decision it makes is in `viewItems`**, which is a
 * function over what is on disk and is tested without an editor; this reads the
 * disk and turns rows into `TreeItem`s.
 */
class SelectionView implements vscode.TreeDataProvider<Row> {
  /** What the extension carries is not a property of the project being viewed. */
  constructor(private readonly extensionPath: string) {}

  /**
   * A blocking host problem, shown before the panel offers anything.
   *
   * Set once at activation rather than computed per render: `docker info` is the
   * expensive half of the host check, and a tree view re-renders on every
   * refresh.
   */
  private hostProblem: string | undefined
  private sandboxWarning: string | undefined

  recordHostProblem(message: string | undefined): void {
    this.hostProblem = message
    this.refresh()
  }

  /** Why the agents' sandbox will not open on this host; undefined when it will. */
  recordSandboxWarning(message: string | undefined): void {
    this.sandboxWarning = message
    this.refresh()
  }

  private readonly changed = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this.changed.event
  private lastBuild: 'ok' | 'failed' | 'cancelled' | undefined

  refresh(): void {
    this.changed.fire()
  }

  /** Session-scoped on purpose: what the last build did is not a project's state. */
  recordBuild(outcome: 'ok' | 'failed' | 'cancelled'): void {
    this.lastBuild = outcome
    this.refresh()
  }

  getChildren(): Row[] {
    const folder = vscode.workspace.workspaceFolders?.[0]
    if (!folder) {
      // **The panel.** This returned nothing, so the view was invisible exactly
      // when somebody has nothing open and most needs a way in.
      return viewItems({
        stacksAvailable: stacksAvailable(carried(this.extensionPath, 'stacks')),
        manifest: null,
        folderOpen: false,
        hostProblem: this.hostProblem,
        sandboxWarning: this.sandboxWarning,
      })
    }
    const project = hostProject()
    if (project.kind === 'none') {
      return [{ kind: 'note', label: 'This project is not reachable from here', detail: project.reason }]
    }
    return viewItems({
      ...readViewState(project.path, this.extensionPath),
      sandboxWarning: this.sandboxWarning,
      lastBuild: this.lastBuild,
    })
  }

  getTreeItem(row: Row): vscode.TreeItem {
    const item = new vscode.TreeItem(row.label, vscode.TreeItemCollapsibleState.None)
    item.description = row.detail
    if (row.kind === 'empty' || row.kind === 'uninitialised') {
      item.tooltip = row.detail
      if (row.kind === 'empty') {
        item.command = { command: CONFIGURE, title: 'Configure' }
      }
    }
    return item
  }
}

/**
 * The stacks a project asked for, from its manifest.
 *
 * An unreadable manifest means no stacks rather than an error: the build
 * composes core alone, which is a working image, and the alternative is
 * refusing to build because a file this function could not parse might have
 * named something. The questions are what refuse an unreadable manifest, and
 * they refuse it rather than overwriting it.
 */
function readManifestStacks(root: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return {}
    const stacks = (parsed as Record<string, unknown>)['stacks']
    return typeof stacks === 'object' && stacks !== null ? (stacks as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function readViewState(root: string, extensionPath: string): ViewState {
  let manifest: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'))
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      manifest = parsed as Record<string, unknown>
    }
  } catch {
    // Absent or unreadable both mean "nothing to show from it". The questions
    // refuse an unreadable one rather than overwriting it; the view does not
    // need to repeat that refusal to stay honest about what it can see.
  }
  return {
    stacksAvailable: stacksAvailable(carried(extensionPath, 'stacks')),
    manifest,
    oldFormat: carriesTemplateSubmodule(readOrNull(join(root, '.gitmodules'))),
  }
}

/**
 * Agent Container: Migrate from code-server (FR-122). **One step per run**,
 * decided by migrationStep from what is on disk and in the container, so a
 * window reloaded by recreating the container loses nothing: run it again and
 * it continues. Every change waits for an explicit Apply, and nothing is
 * committed.
 */
async function migrate(write: (lines: string[]) => void): Promise<void> {
  const project = hostProject()
  if (project.kind === 'none') {
    void vscode.window.showErrorMessage(`Migrate: ${project.reason}.`)
    return
  }
  const root = project.path
  const read = (rel: string) => readOrNull(join(root, rel))
  let tracked: string[] = []
  try {
    tracked = (await run('git', ['-C', root, 'ls-files'], { maxBuffer: 64 * 1024 * 1024 })).stdout.split('\n').filter((f) => f !== '')
  } catch (error) {
    void vscode.window.showErrorMessage(`Migrate: ${root} is not a git repository this can read: ${String(error)}`)
    return
  }
  const hasSubmodule = carriesTemplateSubmodule(read('.gitmodules'))
  const legacy = read(LEGACY_MANIFEST)
  const current = read(MANIFEST)
  const facts: MigrationFacts = {
    oldFormat: hasSubmodule || legacy !== null,
    planningFolders: existsSync(join(root, 'docs/PLANNING')) || existsSync(join(root, 'docs/DEBTS')),
    container: { kind: 'none' },
  }
  let containerId = ''
  if (!facts.oldFormat && facts.planningFolders) {
    try {
      const { stdout } = await dockerBounded([
        'ps', '-a', '--filter', 'label=devcontainer.local_folder',
        '--format', '{{.ID}}\t{{.Names}}\t{{.Label "devcontainer.local_folder"}}\t{{.State}}',
      ])
      const rows = stdout.split('\n').filter((l) => l.trim() !== '').map((l) => {
        const [id = '', name = '', localFolder = '', state = ''] = l.split('\t')
        return { id, name, localFolder, state }
      })
      const choice = containerFor(root, rows)
      if (choice.kind === 'many') facts.container = choice
      if (choice.kind === 'one') {
        containerId = choice.id
        const running = rows.find((r) => r.id === choice.id)?.state === 'running'
        let probe = ''
        if (running) {
          probe = (await dockerBounded([
            'exec', '-u', 'abc', '-e', 'HOME=/config', '-w', '/config/workspace', choice.id, 'sh', '-c',
            'command -v migrate-planning >/dev/null && echo M; test -d .beads/embeddeddolt && echo T && bd list --all --limit 0 --json 2>/dev/null | jq length',
          ], 15000)).stdout
        }
        const lines = probe.split('\n').map((l) => l.trim())
        facts.container = {
          kind: 'one', running,
          hasMigrator: lines.includes('M'), hasTracker: lines.includes('T'),
          items: Number(lines.find((l) => /^\d+$/.test(l)) ?? '0'),
        }
      }
    } catch (error) {
      write([`migrate: could not read the project's container: ${String(error)}`])
    }
  }

  const step = migrationStep(facts)
  write([`migrate: step ${step.step}${'why' in step ? ` — ${step.why}` : ''}`])
  const showPlan = async (content: string) => {
    const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' })
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true })
  }

  if (step.step === 'done') {
    void vscode.window.showInformationMessage('This project is already in the new format: nothing to migrate.')
    return
  }
  if (step.step === 'refuse') {
    void vscode.window.showWarningMessage(`Migrate: ${step.why}`)
    return
  }
  if (step.step === 'rebuild') {
    const build = 'Build the Image'
    const chosen = await vscode.window.showInformationMessage(
      `Migrate: ${step.why}. Build the image and recreate the container, then run Migrate again to move the planning.`, build)
    if (chosen === build) await vscode.commands.executeCommand(BUILD)
    return
  }
  if (step.step === 'files') {
    const texts = new Map<string, string>()
    for (const f of textsWorthReading(tracked)) {
      const t = read(f)
      if (t !== null) texts.set(f, t)
    }
    const plan = planFileMigration({
      hasSubmodule, legacyManifest: legacy, currentManifest: current, texts,
      gitignore: read('.gitignore'),
      trackedDevcontainer: tracked.some((f) => f.startsWith('.devcontainer/')),
    })
    if (plan.kind === 'nothing') {
      void vscode.window.showInformationMessage(plan.why)
      return
    }
    await showPlan(planMarkdown(root, plan))
    const apply = 'Apply'
    const chosen = await vscode.window.showWarningMessage('Apply the migration of the files?', {
      modal: true, detail: `${plan.ops.length} change(s) in ${root}. Nothing is committed.`,
    }, apply)
    if (chosen !== apply) {
      write(['migrate: the files were not changed: the plan was not applied'])
      return
    }
    try {
      await applyFileMigration(root, plan)
    } catch (error) {
      void vscode.window.showErrorMessage(String(error))
      return
    }
    write([`migrate: files migrated; ${plan.report.mentions.length} mention(s) left for review`])
    void vscode.window.showInformationMessage(
      'The files are migrated, uncommitted. Next: build the image and recreate the container, then run Migrate again to move the planning.')
    return
  }
  // step.step === 'planning'
  let preview = ''
  try {
    preview = (await dockerBounded(['exec', '-u', 'abc', '-e', 'HOME=/config', '-w', '/config/workspace', containerId,
      'migrate-planning', '--plan'], 60000)).stdout
  } catch (error) {
    void vscode.window.showErrorMessage(`Migrate: the planning's plan could not be read in the container: ${String(error)}`)
    return
  }
  await showPlan(['# Migrate from code-server: the planning', '', ...(step.resuming ? [step.resuming, ''] : []),
    '```', preview.trim(), '```', '',
    'docs/PLANNING and docs/DEBTS are removed once every item reads back whole. Nothing is committed.', ''].join('\n'))
  const apply = 'Apply'
  const chosen = await vscode.window.showWarningMessage('Move the planning into the tracker?', {
    modal: true, detail: 'It runs inside the container, in a terminal you can read.',
  }, apply)
  if (chosen !== apply) return
  // On the host, where docker is, in either kind of window: see host-terminal.ts.
  const terminal = vscode.window.createTerminal({
    name: 'Migrate the planning',
    pty: hostProcessTerminal('docker',
      ['exec', '-u', 'abc', '-e', 'HOME=/config', '-w', '/config/workspace', containerId, 'migrate-planning']),
  })
  terminal.show()
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
/**
 * **The root is a parameter, and that is the whole reason this task existed.**
 * It read `vscode.workspace.workspaceFolders` and refused with "Open a project
 * folder first" — which is exactly what somebody choosing a folder is trying to
 * do. Asking about the workspace instead of the folder that was chosen would
 * rewrite `.code-server.stack.json` in a repository nobody asked about, and
 * that file is tracked and is the only record of what a project selected.
 *
 * `undefined` keeps the old behaviour for the command invoked with a project
 * already open, which is the only caller that should read the workspace.
 */
async function configure(
  write: (lines: string[]) => void,
  view: SelectionView,
  extensionPath: string,
  forRoot?: string,
): Promise<ConfigureResult> {
  let root = forRoot
  if (root === undefined) {
    const project = hostProject()
    if (project.kind === 'none') {
      // **Refused before anything is read or written**: a path guessed here is
      // a manifest written into a folder that is not the project.
      write([`configure: refused — ${project.reason}`])
      void vscode.window.showErrorMessage(`Configure: ${project.reason}. Nothing was written.`)
      return { wrote: false, root: '(none)', stacks: [] }
    }
    root = project.path
  }
  // What the extension carries, not what the project has. A project is not
  // supposed to have a `.code-server/` at all, and one that still does carries
  // whatever version it last bumped to.
  const stacksDir = carried(extensionPath, 'stacks')

  const available = stacksAvailable(stacksDir)
  if (available.length === 0) {
    // The case that reads as a broken extension rather than a missing checkout.
    void vscode.window.showErrorMessage(
      'No stacks are available. The extension carries them, so an empty list means this ' +
        'installation is incomplete rather than this project being unconfigured — reinstall it.',
    )
    write(['configure: refused, no stacks under ' + stacksDir])
    return { wrote: false, root, stacks: [] }
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
      return { wrote: false, root, stacks: [] }
    }
  }

  const selectedNow = available.filter((name) => name in current)
  const answers = await askAnswers(stacksDir, available, current)
  if (answers === undefined) return { wrote: false, root, stacks: [] }
  const picked = Object.keys(answers.stacks)

  const next = nextManifest(current, answers, available)
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  write([
    `configure: wrote ${MANIFEST}`,
    `  stacks before: ${selectedNow.join(' ') || '(none)'}`,
    `  stacks after:  ${picked.join(' ') || '(none)'}`,
  ])

  // **Confirming builds, even when nothing changed.** `docker build` against an
  // unchanged manifest is a cache hit, and "I answered the questions and nothing
  // happened" is worse than a few seconds. Detecting no change and stopping
  // would also hide the case where somebody wants a rebuild *because* the
  // manifest did not change, which is what a submodule bump looks like.
  //
  // This command wrote the manifest and told the reader to run `setup` by hand
  // until the build existed. The story's scenario asked for a build from the
  // start; what was missing was something to call.
  //
  // **Not awaited when somebody else asked**, because a caller that passed a
  // root is driving a longer sequence and will build the folder it chose —
  // building twice is seven minutes spent on a cache hit nobody is watching.
  if (forRoot === undefined) await build(write, view, extensionPath)

  return { wrote: true, root, stacks: picked }
}

/**
 * Builds the image, in a terminal whose process is `setup` itself.
 *
 * **Not a shell with a command typed into it.** `sendText` leaves the command as
 * editable text, gives no exit code, and makes a path with a space in it a
 * quoting problem. What is here instead is the script as the terminal's process,
 * with `/bin/sh` present for the single purpose of redirecting standard input —
 * see `composeAndBuildCommand`, which is where that reasoning lives.
 */
async function build(
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
async function offerRecreate(hostPath: string, write: (lines: string[]) => void): Promise<void> {
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
 * What the host has, bounded.
 *
 * **An answer that does not arrive in time is `unknown`, not bad.** `docker info`
 * hangs when the daemon is unreachable rather than failing, and this runs on
 * activation as well as before a build — an activation that waits for it is a
 * window opening slowly with nothing saying why.
 */
async function hostChecks(): Promise<HostChecks> {
  const onPath = async (command: string): Promise<boolean> => {
    try {
      await run('command', ['-v', command], { shell: '/bin/sh' })
      return true
    } catch {
      return false
    }
  }

  const [jq, dockerPresent, apt, dnf, pacman] = await Promise.all([
    onPath('jq'),
    onPath('docker'),
    onPath('apt-get'),
    onPath('dnf'),
    onPath('pacman'),
  ])

  let docker: DockerState = 'absent'
  if (dockerPresent) {
    docker = 'unknown'
    try {
      await dockerBounded(['info'])
      docker = 'ok'
    } catch (error) {
      docker = (error as Error).message === 'timeout' ? 'unknown' : 'unusable'
    }
  }

  const exists = (command: string): boolean =>
    command === 'apt-get' ? apt : command === 'dnf' ? dnf : command === 'pacman' ? pacman : false

  return { jq, docker, manager: detectManager(exists), sandbox: await sandboxConditions() }
}

/**
 * What this host does to the agents' sandbox, read on the host where this
 * extension runs. **A read that fails is 'unknown'**, never a guess: a warning
 * that is sometimes false is one everybody learns to ignore. Absent /proc entry
 * means the kernel has no such restriction, which is every host but Ubuntu's.
 */
async function sandboxConditions(): Promise<SandboxConditions> {
  let dockerAppArmor: SandboxConditions['dockerAppArmor'] = 'unknown'
  try {
    const { stdout } = await dockerBounded(['info', '--format', '{{json .SecurityOptions}}'])
    dockerAppArmor = stdout.includes('name=apparmor')
  } catch {
    dockerAppArmor = 'unknown'
  }
  let usernsRestricted: SandboxConditions['usernsRestricted'] = 'unknown'
  try {
    usernsRestricted = readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1'
  } catch (error) {
    usernsRestricted = (error as NodeJS.ErrnoException).code === 'ENOENT' ? false : 'unknown'
  }
  return { dockerAppArmor, usernsRestricted }
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
  const here = prepareHere(vscode.env.remoteName)
  if (!here.act) {
    write([`open flow: nothing to do — ${here.why}`])
    return
  }
  const project = hostProject()
  if (project.kind === 'none') return
  const root = project.path

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

  // **After the configuration and never before it.** These are tracked files in
  // somebody's repository; the configuration is gitignored and disposable. If
  // writing the configuration failed, this function has already returned, and
  // leaving a project with new instruction files and no way to open it would be
  // the worst of the three outcomes.
  for (const w of instructionWrites(root, carried(context.extensionPath, 'assets', 'project'))) {
    if (w.action === 'keep') {
      write([`${w.name}: kept — ${w.because ?? 'unchanged'}`])
      continue
    }
    try {
      writeFileSync(join(root, w.name), w.contents ?? '', 'utf8')
      write([`wrote ${w.name}`])
    } catch (error) {
      // Not fatal. A project that cannot take its instruction files can still
      // be opened, and saying so is more use than refusing the open over it.
      write([`${w.name}: could not be written: ${String(error)}`])
    }
  }

  // Shown because the tooling's own notification cannot say any of it, and the
  // alternative is a project that opens with limits nobody asked for.
  for (const note of decision.notes) {
    void vscode.window.showWarningMessage(note)
  }

  if (decision.action === 'build') {
    write([`open: ${decision.cause}`])
    const outcome = await buildInTerminal(root, context.extensionPath, write)
    write([`open: build ${outcome}`])
    if (!handsOver(outcome)) {
      // Said rather than left silent: a terminal that closed is not obviously
      // a decision the extension noticed.
      void vscode.window.showWarningMessage(
        outcome === 'cancelled'
          ? 'The build was stopped, so the project was not opened.'
          : 'The build failed, so the project was not opened. Its output is in the terminal.',
      )
      return
    }
  }

  if (options.handOver || decision.action === 'build') {
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
    manifest: readOrNull(join(root, MANIFEST)),
    existingConfig: readOrNull(join(root, CONFIG_PATH)),
    runningContainers: await runningContainers(write),
    reopenCommandAvailable: (await vscode.commands.getCommands(true)).includes(REOPEN_COMMAND),
    gitignore: readOrNull(join(root, '.gitignore')),
    image: await imageState(projectNames(root).image, write),
  }
}

/**
 * Names of running containers. A runtime that cannot be reached yields none:
 * refusing on that is FR-24, which belongs to the story that owns every
 * refusal, and guessing it here would duplicate that message badly. It is
 * written to the channel so the next failure is not a surprise.
 */
/**
 * Whether the project's image is there, and **`unknown` when that cannot be
 * told apart from the daemon not answering.**
 *
 * `docker image inspect` exits non-zero for a missing image and for an
 * unreachable daemon alike, and the two must not be collapsed: FR-24 already
 * refuses an unreachable daemon, and reading it as a missing image would start
 * a build that takes minutes and then fails for a third reason.
 *
 * The distinction is made by asking a second question. `docker version
 * --format {{.Server.Version}}` answers only when there is a daemon, so a
 * failed inspect plus a working version is **absent**, and a failed inspect
 * plus a failed version is **unknown**. One extra process, on the path where
 * something is already wrong.
 */
async function imageState(
  image: string,
  write: (lines: string[]) => void,
): Promise<ImageState> {
  try {
    await dockerBounded(['image', 'inspect', image])
    return 'present'
  } catch {
    try {
      await dockerBounded(['version', '--format', '{{.Server.Version}}'])
      write([`image ${image}: not present`])
      return 'absent'
    } catch (error) {
      write([`image ${image}: could not be determined — ${String(error)}`])
      return 'unknown'
    }
  }
}

async function runningContainers(write: (lines: string[]) => void): Promise<string[]> {
  try {
    const { stdout } = await dockerBounded(['ps', '--format', '{{.Names}}'])
    return stdout.split('\n').map((n) => n.trim()).filter((n) => n !== '')
  } catch (error) {
    write([`could not list running containers: ${String(error)}`])
    return []
  }
}

async function describe(context: vscode.ExtensionContext): Promise<string[]> {
  const project = hostProject()
  if (project.kind === 'none') return [`no project to describe: ${project.reason}`]
  return [
    `project: ${project.path}`,
    ...formatDetected({
      facts: hostFacts(),
      // **Where this extension runs, not where the window points.** remoteName
      // says the window is remote; it was read as "the extension is not on the
      // host" and printed a false alarm in every connected window. The
      // extension's own kind is the answer: UI runs on the host.
      runningOnHost: context.extension?.extensionKind === vscode.ExtensionKind?.UI,
    }),
  ]
}

/** The project's folder on the host, for this window. See projectOnHost. */
function hostProject(): ProjectOnHost {
  const folder = vscode.workspace.workspaceFolders?.[0]
  return projectOnHost({
    remoteName: vscode.env.remoteName,
    folder: folder === undefined ? undefined : { fsPath: folder.uri.fsPath, authority: folder.uri.authority },
  })
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

/**
 * The folder picker, and the thin half of it.
 *
 * **Everything decidable is in `decidePick`**, because `showOpenDialog` and
 * `vscode.openFolder` cannot be exercised without an editor. What is left here
 * is asking, reading one file, and doing what came back — and the one thing it
 * must not do is decide anything.
 */
async function pick(
  write: (lines: string[]) => void,
  view: SelectionView,
  extensionPath: string,
): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Open as Dev Container Project',
  })
  const chosen = picked?.[0]?.fsPath
  const decision = decidePick({
    chosen,
    currentFolder: (() => { const p = hostProject(); return p.kind === 'host' ? p.path : undefined })(),
    hasManifest: chosen !== undefined && existsSync(join(chosen, MANIFEST)),
  })

  if (decision.action === 'nothing') {
    if (decision.because !== undefined) {
      write([`open: ${decision.because}`])
      void vscode.window.showInformationMessage(decision.because)
    }
    return
  }
  if (decision.action === 'refuse') {
    write([`open: refused — ${decision.because}`])
    void vscode.window.showWarningMessage(decision.because)
    return
  }

  if (decision.action === 'configure') {
    write([`open: ${decision.because}`])
    const outcome = configureOutcome(await configure(write, view, extensionPath, decision.folder))
    write([`open: ${outcome.message}`])
    if (!outcome.proceed) {
      void vscode.window.showInformationMessage(outcome.message)
      return
    }
    // **Falls through to opening the folder it just configured.** The third
    // failure scenario is the one where nothing fails: asking five questions,
    // writing the file, and then appearing to forget.
  }

  write([`open: ${decision.folder}${decision.newWindow ? ' in a new window' : ''}`])
  await vscode.commands.executeCommand(
    'vscode.openFolder',
    vscode.Uri.file(decision.folder),
    { forceNewWindow: decision.newWindow },
  )
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
async function buildInTerminal(
  root: string,
  extensionPath: string,
  write: (lines: string[]) => void,
): Promise<'ok' | 'failed' | 'cancelled'> {
  const stacks = Object.keys(readManifestStacks(root))
  const compose = composeCommand(extensionPath, root, stacks)
  const dockerfileOut = join(tmpdir(), `${compose.image}.Dockerfile`)
  const { shellPath, shellArgs } = composeAndBuildCommand(compose, dockerfileOut)
  const terminal = vscode.window.createTerminal({
    name: 'Agent Container: build',
    pty: hostProcessTerminal(shellPath, shellArgs),
  })
  terminal.show()
  write([
    `build: composing from ${compose.script}`,
    `build: ${stacks.length} stack(s): ${stacks.join(', ') || '(none)'}`,
    `build: image ${compose.image}, context ${compose.context}`,
  ])

  return await new Promise((resolve) => {
    const listener = vscode.window.onDidCloseTerminal((closed) => {
      if (closed !== terminal) return
      listener.dispose()
      const outcome = buildOutcome(closed.exitStatus?.code)
      write([`build: ${outcome}`])
      resolve(outcome)
    })
  })
}

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
async function create(write: (lines: string[]) => void, extensionPath: string): Promise<void> {
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
function apply(root: string, writes: { path: string; contents: string }[],
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

async function askAiMemory(): Promise<boolean> {
  const answer = await vscode.window.showQuickPick(['No', 'Yes'], {
    title: 'Should this project record what the agent was told?',
    placeHolder: 'ai-memory: off unless asked for. Captured to disk, on this machine, per project.',
  })
  return answer === 'Yes'
}

/**
 * The five questions, without writing anything.
 *
 * **Extracted because creating a project needs the answers and not the write.**
 * `configure` asked and wrote in one pass, which is right when the manifest is
 * the only thing being changed — and wrong for creation, where the manifest is
 * one of five files a plan writes together. Calling `configure` from the create
 * flow would have written the manifest into a directory that then failed
 * `scaffoldPlan`'s empty check, and written it a second time from fabricated
 * answers.
 *
 * `undefined` is a cancellation at any step. Nothing partial is returned,
 * because nothing partial is useful: a manifest missing a version is not a
 * manifest.
 */
async function askAnswers(
  stacksDir: string,
  available: string[],
  current: Record<string, unknown>,
): Promise<Answers | undefined> {
  const picked = await vscode.window.showQuickPick(available, {
    canPickMany: true,
    title: 'Which stacks does this project need?',
    placeHolder: 'Nothing selected builds the core image alone',
  })
  if (picked === undefined) return undefined

  const [missing] = missingDependencies(picked, stacksDir)
  if (missing) {
    void vscode.window.showErrorMessage(
      `Stack '${missing.stack}' requires '${missing.needs}' — select it too.`,
    )
    return undefined
  }

  const stacks: Record<string, string> = {}
  for (const stack of picked) {
    const recorded = typeof current[stack] === 'string' ? (current[stack] as string) : undefined
    const version = await vscode.window.showQuickPick(
      orderedVersions(versionsOf(stacksDir, stack), recorded),
      { title: `Which version of ${stack}?` },
    )
    if (version === undefined) return undefined
    stacks[stack] = version
  }

  // The defaults are a function rather than literals here: the memory default and
  // "the lowest version listed" have to agree with `setup`'s, and they were a
  // literal in this file and a literal in a shell script in another repository.
  const defaults = limitDefaults(current)
  const memory = await ask('Memory the container may use', defaults.memory)
  if (memory === undefined) return undefined
  const swap = await ask('Memory plus swap, empty to derive memory + 2g', defaults.memorySwap)
  if (swap === undefined) return undefined
  const cpus = await ask("Cores to pin, empty for half the host's", defaults.cpus)
  if (cpus === undefined) return undefined

  const answers: Answers = {
    stacks,
    limits: {
      memory,
      ...(swap ? { memorySwap: swap } : {}),
      ...(cpus ? { cpus: Number(cpus) } : {}),
    },
  }

  return answers
}
