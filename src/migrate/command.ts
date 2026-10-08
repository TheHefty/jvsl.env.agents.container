import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as vscode from 'vscode'

import { build } from '../build/command.ts'
import { BUILD } from '../commands.ts'
import { apply } from '../create/command.ts'
import { run, dockerBounded } from '../host/docker.ts'
import { hostProcessTerminal } from '../host/host-terminal.ts'
import { containerFor } from '../host/locate.ts'
import { hostProject, readOrNull } from '../host/project.ts'
import { applyFileMigration, carriesTemplateSubmodule, planFileMigration, textsWorthReading } from './migrate-files.ts'
import { migrationStep, planMarkdown, type MigrationFacts } from './migrate-step.ts'
import { MANIFEST, LEGACY_MANIFEST } from '../shared/stack-manifest.ts'

/**
 * Agent Container: Migrate from code-server (FR-122). **One step per run**,
 * decided by migrationStep from what is on disk and in the container, so a
 * window reloaded by recreating the container loses nothing: run it again and
 * it continues. Every change waits for an explicit Apply, and nothing is
 * committed.
 */
export async function migrate(write: (lines: string[]) => void): Promise<void> {
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
