import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as vscode from 'vscode'

import { build } from '../build/command.ts'
import { carried } from '../build/template.ts'
import { configureOutcome, type ConfigureResult } from './configure.ts'
import { decidePick } from './pick.ts'
import { limitDefaults, missingDependencies, nextManifest, orderedVersions, stacksAvailable, versionsOf, type Answers } from './questions.ts'
import { create } from '../create/command.ts'
import { scaffoldPlan } from '../create/scaffold.ts'
import { run } from '../host/docker.ts'
import { hostProject } from '../host/project.ts'
import { MANIFEST } from '../shared/stack-manifest.ts'
import { SelectionView } from '../view/selection-view.ts'

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
export async function configure(
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

/** An input box whose undefined means escape, which the caller treats as abandon. */
export async function ask(title: string, value: string): Promise<string | undefined> {
  return vscode.window.showInputBox({ title, value })
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
export async function askAnswers(
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
