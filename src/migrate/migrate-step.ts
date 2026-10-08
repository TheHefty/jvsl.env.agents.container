/**
 * Which step a project is at, on its way off the code-server template (FR-122;
 * story the-command-carries-a-project-across in the tracker).
 *
 * **Decided from what is on disk and in the container, never from remembered
 * progress.** Recreating the container reloads a connected window, so a flow
 * that carried its state in memory would be lost half-way. Run again, the
 * command reads the facts afresh and continues from the step they show.
 *
 * Pure: the command reads the facts and does what this returns.
 */
import type { Plan } from './migrate-files.ts'

export interface MigrationFacts {
  /** The submodule or the old manifest is still there. */
  oldFormat: boolean
  /** docs/PLANNING or docs/DEBTS is still there. */
  planningFolders: boolean
  container:
    | { kind: 'none' }
    | { kind: 'many'; names: string[] }
    | { kind: 'one'; running: boolean; hasMigrator: boolean; hasTracker: boolean; items: number }
}

export type MigrationStep =
  | { step: 'files' }
  | { step: 'rebuild'; why: string }
  /** `resuming` says what an earlier run left, when it left anything. */
  | { step: 'planning'; resuming?: string }
  | { step: 'refuse'; why: string }
  | { step: 'done' }

export function migrationStep(f: MigrationFacts): MigrationStep {
  if (f.oldFormat) return { step: 'files' }
  if (!f.planningFolders) return { step: 'done' }
  const c = f.container
  if (c.kind === 'many') {
    return {
      step: 'refuse',
      why: `more than one container claims this project (${c.names.join(', ')}); stop the ones not in use first`,
    }
  }
  if (c.kind === 'none') return { step: 'rebuild', why: 'there is no container for this project yet' }
  if (!c.running) return { step: 'rebuild', why: "the project's container is not running" }
  if (!c.hasMigrator) return { step: 'rebuild', why: 'the container runs an image without migrate-planning' }
  if (!c.hasTracker) return { step: 'rebuild', why: "the container has not initialised the project's tracker" }
  // **An earlier run that stopped is carried on, not refused** (FR-128): the
  // script places what the tracker holds and creates only what is missing, and
  // refuses on its own when it holds something the folders do not describe.
  if (c.items > 0) {
    return {
      step: 'planning',
      resuming:
        `The tracker already holds ${c.items} item(s) while docs/PLANNING or docs/DEBTS is still here, so an ` +
        'earlier run stopped part-way. This run carries on from where it stopped: it creates only what is ' +
        'missing, and refuses before writing anything if the tracker holds an item the folders do not describe.',
    }
  }
  return { step: 'planning' }
}

/** The files' plan as Markdown, for the operator to read before Apply. */
export function planMarkdown(hostPath: string, plan: Plan & { kind: 'plan' }): string {
  const ops = plan.ops.map((o) =>
    o.kind === 'write' ? `- write \`${o.path}\``
      : o.kind === 'remove' ? `- remove \`${o.path}\``
      : o.kind === 'untrack' ? `- stop tracking \`${o.path}\` (git rm --cached; it stays on disk)`
      : `- remove the submodule \`${o.path}\` (git rm)`,
  )
  const mentions = plan.report.mentions.length === 0
    ? ['None.']
    : plan.report.mentions.map((m) => `- \`${m.path}:${m.line}\`: ${m.text}`)
  return [
    '# Migrate from code-server: the files',
    '',
    `Project: \`${hostPath}\``,
    '',
    '## What changes',
    '',
    ...ops,
    '',
    '## Mentions left as written',
    '',
    'These still mention the submodule. They are not rewritten; review them after the migration.',
    '',
    ...mentions,
    '',
    '## Afterwards',
    '',
    'Nothing is committed. ' + plan.report.undo,
    '',
    'Next: rebuild the image and recreate the container, then run this command again to move the planning.',
    '',
  ].join('\n')
}

/**
 * The planning step's preview, and whether to offer Apply.
 *
 * **A plan that will refuse offers no Apply**, and says so before the plan
 * itself (debt a-refusal-is-gone-before-it-can-be-read). Applying it could only
 * run to the same refusal, and on kotodori that refusal then vanished with its
 * terminal. migrate-planning prints `REFUSES:` on its first line when it will.
 */
export function planningPreview(output: string, resuming?: string): { apply: boolean; markdown: string } {
  const refuses = /^migrate-planning: REFUSES:/m.test(output)
  return {
    apply: !refuses,
    markdown: [
      '# Migrate from code-server: the planning',
      '',
      ...(refuses
        ? ['**The run would refuse, so there is nothing to apply.** The reason is at the top of the plan below; fix it in the project, then run Migrate again.', '']
        : resuming ? [resuming, ''] : []),
      '```',
      output.trim(),
      '```',
      '',
      ...(refuses ? [] : ['docs/PLANNING and docs/DEBTS are removed once every item reads back whole. Nothing is committed.', '']),
    ].join('\n'),
  }
}
