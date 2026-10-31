import * as vscode from 'vscode'

import { build } from '../build/command.ts'
import { carried } from '../build/template.ts'
import { OPEN } from '../commands.ts'
import { configureOutcome, type ConfigureResult } from './configure.ts'
import { decidePick } from './pick.ts'
import { limitDefaults, missingDependencies, nextManifest, orderedVersions, stacksAvailable, switchAnswer, switchChoices, versionsOf, type Answers } from './questions.ts'
import {
  JOURNAL_CONFIG_PATH,
  journalFilesFor,
  normalizeJournalRepository,
  persistJournalRepository,
  readJournalRepository,
} from './journal.ts'
import { applySwitches, MEMORY_MARKER } from './switches.ts'
import { findGradleBuildsFor } from '../build/gradle.ts'
import { filesFor } from '../host/files.ts'
import { dockerFor } from '../host/docker.ts'
import { factsFor } from '../host/host.ts'
import { homeFor } from '../host/home.ts'
import { mountPath, pickedProject, type ProjectOnHost } from '../host/locate.ts'
import { hostProject } from '../host/project.ts'
import { CONFIG_PATH, regenerateConfiguration } from '../open/open.ts'
import { MANIFEST } from '../shared/stack-manifest.ts'
import { SelectionView } from '../view/selection-view.ts'

/**
 * Asks the project questions and writes its manifest. When beads is on, the
 * final question also sets the developer's shared journal destination. The
 * build is a separate story, and this is useful without it because `setup`
 * reads what this writes.
 *
 * **Manifest decisions are in `questions.ts` and journal-file decisions are in
 * `journal.ts`**, both testable without an editor. What is left is the UI
 * sequence and the rule that escaping any question writes nothing: a
 * half-answered manifest is worse than none, because `setup` would read it and
 * build something nobody chose, successfully.
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
export async function configure(
  write: (lines: string[]) => void,
  view: SelectionView,
  extensionPath: string,
  extensionVersion: string,
  /** The project a picked folder is: on this machine, or in a WSL distro (debt ck8). */
  forProject?: Exclude<ProjectOnHost, { kind: 'none' }>,
): Promise<ConfigureResult> {
  let root = forProject?.path
  // Where the project lives, for regenerating its configuration and writing its
  // manifest: through the distro for a WSL project.
  let location: Exclude<ProjectOnHost, { kind: 'none' }> | undefined = forProject
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
    location = project
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

  // Where the project lives: through the distro for a WSL project.
  const projectLocation = location ?? { kind: 'host', path: root }
  const files = filesFor(projectLocation)
  let current: Record<string, unknown> = {}
  try {
    // Only a manifest that exists and cannot be read is a refusal; an absent one
    // is a project that has not been configured yet, which is the whole point.
    const raw = files.read(MANIFEST)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        current = parsed as Record<string, unknown>
      }
    }
  } catch (error) {
    write([`configure: refused — ${MANIFEST} could not be read: ${String(error)}`])
    void vscode.window.showErrorMessage(
      `${MANIFEST} cannot be read, and rewriting it would lose whatever it holds. Fix it first. (${String(error)})`,
    )
    return { wrote: false, root, stacks: [] }
  }

  const selectedNow = available.filter((name) => name in current)
  let answers = await askAnswers(stacksDir, available, current, {
    beads: current['beads'] === true,
    aiMemory: files.exists(MEMORY_MARKER),
  })
  if (answers === undefined) return { wrote: false, root, stacks: [] }
  let journalFiles: ReturnType<typeof journalFilesFor> | undefined
  if (answers.beads === true) {
    const home = await homeFor(projectLocation)
    if (!home.ok) {
      const message = `the private journal repository could not be configured: ${home.reason}`
      write([`configure: refused — ${message}. Nothing was written.`])
      void vscode.window.showErrorMessage(`Configure: ${message}. Nothing was written.`)
      return { wrote: false, root, stacks: [] }
    }
    journalFiles = journalFilesFor(projectLocation, home.home)
    let currentJournal: string
    try {
      currentJournal = readJournalRepository(journalFiles)
    } catch (error) {
      const message = `the private journal setting could not be read: ${String(error)}`
      write([`configure: refused — ${message}. Nothing was written.`])
      void vscode.window.showErrorMessage(`Configure: ${message}. Nothing was written.`)
      return { wrote: false, root, stacks: [] }
    }
    const journalRepository = await askJournalRepository(currentJournal)
    if (journalRepository === undefined) return { wrote: false, root, stacks: [] }
    answers = { ...answers, journalRepository }
  }
  const picked = Object.keys(answers.stacks)

  const next = nextManifest(current, answers, available)
  try {
    files.write(MANIFEST, `${JSON.stringify(next, null, 2)}\n`)
  } catch (error) {
    write([`configure: could not write ${MANIFEST}: ${String(error)}`])
    void vscode.window.showErrorMessage(`Could not write ${MANIFEST}: ${String(error)}`)
    return { wrote: false, root, stacks: [] }
  }
  write([
    `configure: wrote ${MANIFEST}`,
    `  stacks before: ${selectedNow.join(' ') || '(none)'}`,
    `  stacks after:  ${picked.join(' ') || '(none)'}`,
  ])
  try {
    applySwitches(files, answers, write)
  } catch (error) {
    write([`configure: ai-memory's marker could not be changed: ${String(error)}`])
    void vscode.window.showErrorMessage(`Could not change ${MEMORY_MARKER}: ${String(error)}`)
  }
  if (journalFiles !== undefined && answers.journalRepository !== undefined) {
    try {
      if (persistJournalRepository(journalFiles, answers.beads, answers.journalRepository)) {
        write(answers.journalRepository === ''
          ? ['configure: no developer journal repository is configured; journal entries will use the outbox']
          : [`configure: saved the developer's journal repository in ${JOURNAL_CONFIG_PATH}`])
      }
    } catch (error) {
      const message = `the journal repository was not saved: ${String(error)}. Journal entries will use the outbox or the previous repository.`
      write([`configure: ${message}`])
      void vscode.window.showWarningMessage(`Configure: ${message}`)
    }
  }
  if (location !== undefined) await regenerate(location, extensionVersion, write)

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
  if (forProject === undefined) await build(write, view, extensionPath)

  return { wrote: true, root, stacks: picked }
}

/**
 * The folder picker, and the thin half of it.
 *
 * **Everything decidable is in `decidePick`**, because `showOpenDialog` and
 * `vscode.openFolder` cannot be exercised without an editor. What is left here
 * is asking, reading one file, and doing what came back — and the one thing it
 * must not do is decide anything.
 */
export async function pick(
  write: (lines: string[]) => void,
  view: SelectionView,
  extensionPath: string,
  extensionVersion: string,
  handOver: (folder: string) => Thenable<void>,
): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Open as Dev Container Project',
  })
  // **The picked address, kept whole** (debt ck8): from a WSL window it names a
  // folder in the distro, and its fsPath alone would name one on Windows.
  const uri = picked?.[0]
  const project = uri === undefined ? undefined : pickedProject(uri)
  if (project?.kind === 'none') {
    write([`open: refused — ${project.reason}`])
    void vscode.window.showWarningMessage(`Open: ${project.reason}.`)
    return
  }
  const current = hostProject()
  const decision = decidePick({
    chosen: project?.path,
    currentFolder: current.kind === 'none' ? undefined : current.path,
    hasManifest: project !== undefined && filesFor(project).exists(MANIFEST),
  })

  if (decision.action === 'nothing') {
    if (decision.because !== undefined) {
      write([`open: ${decision.because}`])
      void vscode.window.showInformationMessage(decision.because)
    }
    return
  }
  if (decision.action === 'prepare') {
    // The folder this window already has: prepare it here, since opening it
    // wrote nothing (story opening-a-folder-writes-nothing).
    write(['open: this window\'s folder, prepared here'])
    await vscode.commands.executeCommand(OPEN)
    return
  }
  if (decision.action === 'refuse') {
    write([`open: refused — ${decision.because}`])
    void vscode.window.showWarningMessage(decision.because)
    return
  }

  if (decision.action === 'configure') {
    write([`open: ${decision.because}`])
    const outcome = configureOutcome(await configure(write, view, extensionPath, extensionVersion, project))
    write([`open: ${outcome.message}`])
    if (!outcome.proceed) {
      void vscode.window.showInformationMessage(outcome.message)
      return
    }
    // The window's own folder is prepared where it is, as 'prepare' does: never
    // handed over to a second window onto the same folder (debt y6w).
    if (decision.here) {
      write(["open: this window's folder, configured and prepared here"])
      await vscode.commands.executeCommand(OPEN)
      return
    }
    // **Falls through to opening the folder it just configured.** The third
    // failure scenario is the one where nothing fails: asking the setup questions,
    // writing the file, and then appearing to forget.
  }

  write([`open: ${decision.folder}${decision.newWindow ? ' in a new window' : ''}`])
  // The window that opens the folder prepares it only because this asked:
  // activation alone writes nothing (story opening-a-folder-writes-nothing).
  await handOver(decision.folder)
  await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: decision.newWindow })
}

/** An input box whose undefined means escape, which the caller treats as abandon. */
export async function ask(title: string, value: string): Promise<string | undefined> {
  return vscode.window.showInputBox({ title, value })
}

/**
 * The stacks, limits and project switches, without writing anything. The
 * developer-global journal destination is asked separately when beads is on.
 *
 * **Extracted because creating a project needs the answers and not the write.**
 * `configure` asked and wrote in one pass, which is right when the manifest is
 * the only thing being changed — and wrong for creation, where the manifest is
 * one of the files a plan writes together. Calling `configure` from the create
 * flow would have written the manifest into a directory that then failed
 * `scaffoldPlan`'s empty check, and written it a second time from fabricated
 * answers.
 *
 * `undefined` is a cancellation at any step. Nothing partial is returned,
 * because nothing partial is useful: a manifest missing a version is not a
 * manifest.
 */
export async function askAnswers(
  stacksDir: string,
  available: string[],
  current: Record<string, unknown>,
  /** Where the project's switches are now, so each question starts there (story d27.1). */
  now: { beads: boolean; aiMemory: boolean } = { beads: current['beads'] === true, aiMemory: false },
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
    const recorded = typeof current[stack] === 'string' ? (current[stack]) : undefined
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

  // The project's switches, asked like the rest, starting where it is (story d27.1).
  const beads = switchAnswer(await vscode.window.showQuickPick(switchChoices(now.beads), {
    title: 'Does this project use the work tracker (beads)?',
    placeHolder: 'Its board, ceremonies and journal. Off keeps any .beads/ as it is.',
  }))
  if (beads === undefined) return undefined
  const aiMemory = switchAnswer(await vscode.window.showQuickPick(switchChoices(now.aiMemory), {
    title: 'Should this project record what the agent was told (ai-memory)?',
    placeHolder: 'Captured to disk, on this machine, per project. Off keeps the store it has.',
  }))
  if (aiMemory === undefined) return undefined

  const answers: Answers = {
    stacks,
    limits: {
      memory,
      ...(swap ? { memorySwap: swap } : {}),
      ...(cpus ? { cpus: Number(cpus) } : {}),
    },
    beads,
    aiMemory,
  }

  return answers
}

/** Ask for the developer-global private journal, with empty selecting the outbox. */
export async function askJournalRepository(current: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: 'Private journal repository for the working day',
    value: current,
    prompt: 'GitHub URL or owner/repo. Clear the value to use the local outbox.',
    validateInput: (input) => {
      const result = normalizeJournalRepository(input)
      return result.ok ? undefined : result.reason
    },
  })
  if (value === undefined) return undefined
  const result = normalizeJournalRepository(value)
  return result.ok ? result.repository : undefined
}

/**
 * The container configuration, brought in line with the manifest just written.
 *
 * **Why** (debt configure-changes-the-limits-but-the-container-keeps-the-old-
 * ones, reported 2026-10-22): the limits reach the container only as runArgs in
 * this file, and only opening wrote it, so raising the memory here and
 * rebuilding the container kept the old memory. Said once on screen when the
 * file changed, because the new limits — like the image this command rebuilds —
 * apply only when the container is recreated.
 */
async function regenerate(
  location: Exclude<ProjectOnHost, { kind: 'none' }>,
  extensionVersion: string,
  write: (lines: string[]) => void,
): Promise<void> {
  const files = filesFor(location)
  let existingConfig: string | null
  try {
    existingConfig = files.read(CONFIG_PATH)
  } catch (error) {
    write([`configure: ${CONFIG_PATH} not regenerated: ${String(error)}`])
    void vscode.window.showWarningMessage(`The new limits are not in ${CONFIG_PATH}: ${String(error)}`)
    return
  }
  const scan = findGradleBuildsFor(location, files)
  write(scan.log)
  let measured
  try {
    measured = await factsFor(location, dockerFor(location))
  } catch (error) {
    write([`configure: ${CONFIG_PATH} not regenerated: docker could not be asked (${String(error)})`])
    void vscode.window.showWarningMessage(
      `The new limits are not in ${CONFIG_PATH}: docker did not answer, so the machine's devices are unknown.`,
    )
    return
  }
  write(measured.notes.map((n) => `facts: ${n}`))
  const home = await homeFor(location)
  if (!home.ok) {
    write([`configure: ${CONFIG_PATH} not regenerated: ${home.reason}`])
    void vscode.window.showWarningMessage(`The new limits are not in ${CONFIG_PATH}: ${home.reason}.`)
    return
  }
  const r = regenerateConfiguration({
    projectRoot: mountPath(location),
    homeDir: home.home.mount,
    extensionVersion,
    facts: measured.facts,
    manifest: files.read(MANIFEST),
    existingConfig,
    gradleBuilds: scan.builds,
  })
  if (r.action === 'keep') {
    write([`configure: ${CONFIG_PATH} not regenerated: ${r.why}`])
    void vscode.window.showWarningMessage(`The new limits are not in ${CONFIG_PATH}: ${r.why}`)
    return
  }
  write([...r.log, ...r.notes.map((n) => `note: ${n}`)])
  if (r.serialised === existingConfig) {
    write([`configure: ${CONFIG_PATH} already matches the manifest`])
    return
  }
  try {
    files.write(CONFIG_PATH, r.serialised)
  } catch (error) {
    const cause = `could not write ${CONFIG_PATH}: ${String(error)}`
    write([`configure: ${cause}`])
    void vscode.window.showErrorMessage(cause)
    return
  }
  write([`configure: wrote ${CONFIG_PATH} from the manifest`])
  void vscode.window.showInformationMessage(
    `${CONFIG_PATH} now carries the new limits. They apply when the container is rebuilt ` +
      `(Dev Containers: Rebuild Container), as the rebuilt image does.`,
  )
}
