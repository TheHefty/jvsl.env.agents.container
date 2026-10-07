import { execFile } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

import { LEGACY_MANIFEST, MANIFEST } from './stack-manifest.ts'

const run = promisify(execFile)

/**
 * The host-side half of moving a project off the code-server template, as a
 * plan computed from the project's files (FR-123, FR-124, FR-127; story
 * the-files-move-on-the-host in the tracker).
 *
 * **Pure, and it changes nothing.** It returns operations and a report; the
 * command applies them, and nothing is ever committed. Measured on fresh clones
 * of fahrenheit404, gosnip and kotodori on 2026-10-07: the submodule, the old
 * manifest, `@…/.code-server/…` imports, and in two of them a pre-commit that
 * runs the size check from the submodule.
 */

export interface ProjectFiles {
  /** Whether `.code-server` is a submodule of the project. */
  hasSubmodule: boolean
  legacyManifest: string | null
  currentManifest: string | null
  /** Every tracked text file worth reading, by path relative to the root. */
  texts: ReadonlyMap<string, string>
}

export type Op =
  | { kind: 'write'; path: string; content: string }
  | { kind: 'remove'; path: string }
  | { kind: 'remove-submodule'; path: string }

export interface Mention {
  path: string
  line: number
  text: string
}

export type Plan =
  | { kind: 'nothing'; why: string }
  | { kind: 'plan'; ops: Op[]; report: { mentions: Mention[]; undo: string } }

const INSTRUCTIONS = ['CLAUDE.md', 'AGENTS.md', 'docs/RULES.md']
const HOOK = '.githooks/pre-commit'

/** A line that is only an import from the submodule: `@.code-server/…`, `@../.code-server/…`. */
const IMPORT = /^@\S*\.code-server\/\S*[ \t]*$/

/**
 * The pre-commit fahrenheit404 and gosnip carry, identical in both: from the
 * line naming the check in the submodule to the `exec` that runs it. Matched
 * exactly; a hook in any other shape is left alone and listed.
 */
const LEGACY_HOOK_BLOCK = /CHECK="\$HERE\/\.\.\/\.code-server\/scripts\/check-md-size\.sh"[\s\S]*?exec bash "\$CHECK" --root "\$HERE\/\.\."/

const NEW_HOOK_BLOCK = `# check-md-size ships in the agent container's image, on its PATH (FR-127).
# In a window connected to the project's container the editor's git runs
# inside it, where the image's PATH is. Say why, rather than dying on a
# missing command.
if ! command -v check-md-size >/dev/null 2>&1; then
    echo "pre-commit: check-md-size is not on PATH. It ships in the agent container's image:" >&2
    echo "pre-commit: commit from a window connected to the project's container, or rebuild its image." >&2
    exit 1
fi

exec check-md-size --root "$HERE/.."`

export function planFileMigration(project: ProjectFiles): Plan {
  if (!project.hasSubmodule && project.legacyManifest === null) {
    return {
      kind: 'nothing',
      why: `nothing to migrate: this project has no .code-server submodule and no ${LEGACY_MANIFEST}`,
    }
  }

  const writes: Op[] = []
  const removes: Op[] = []
  const edited = new Set<string>()

  // **The manifest may already have its current name**: the extension adopts
  // the old one on first opening a project, without turning the tracker on.
  const source = project.currentManifest ?? project.legacyManifest
  if (source !== null) {
    const base = JSON.parse(source) as Record<string, unknown>
    if (project.legacyManifest !== null || base['beads'] !== true) {
      writes.push({ kind: 'write', path: MANIFEST, content: `${JSON.stringify({ ...base, beads: true }, null, 2)}\n` })
    }
    if (project.legacyManifest !== null) removes.push({ kind: 'remove', path: LEGACY_MANIFEST })
  }

  for (const path of INSTRUCTIONS) {
    const text = project.texts.get(path)
    if (text === undefined) continue
    const kept = text.split('\n').filter((line) => !IMPORT.test(line)).join('\n')
    if (kept !== text) {
      writes.push({ kind: 'write', path, content: kept })
      edited.add(path)
    }
  }

  const hook = project.texts.get(HOOK)
  if (hook !== undefined && LEGACY_HOOK_BLOCK.test(hook)) {
    writes.push({ kind: 'write', path: HOOK, content: hook.replace(LEGACY_HOOK_BLOCK, NEW_HOOK_BLOCK) })
    edited.add(HOOK)
  }

  // Every mention that remains after the edits, in every file, listed with
  // its line and never rewritten.
  const after = new Map(project.texts)
  for (const op of writes) if (op.kind === 'write' && after.has(op.path)) after.set(op.path, op.content)
  const mentions: Mention[] = []
  for (const [path, text] of after) {
    // CHANGELOG.md is history, written by release-please and never rewritten;
    // docs/PLANNING and docs/DEBTS move into the tracker (story 2) and go.
    if (path === 'CHANGELOG.md' || path.startsWith('docs/PLANNING/') || path.startsWith('docs/DEBTS/')) continue
    text.split('\n').forEach((line, i) => {
      if (line.includes('.code-server')) mentions.push({ path, line: i + 1, text: line.trim() })
    })
  }

  const ops: Op[] = [
    ...writes,
    ...removes,
    ...(project.hasSubmodule ? [{ kind: 'remove-submodule', path: '.code-server' } as Op] : []),
  ]
  return {
    kind: 'plan',
    ops,
    report: {
      mentions,
      undo: 'Nothing was committed. To undo all of it: git restore --staged --worktree . && git submodule update --init',
    },
  }
}

/**
 * Applies a plan, in its order: files written, old files removed, and the
 * submodule removed last with `git rm`, which also drops its `.gitmodules`
 * section and stages that change. **Nothing is committed.** A failure stops
 * at the operation that failed and is raised with its name; what came before
 * it is in the working tree, and the plan's report says how to undo it.
 */
export async function applyFileMigration(root: string, plan: Plan & { kind: 'plan' }): Promise<void> {
  for (const op of plan.ops) {
    try {
      if (op.kind === 'write') {
        mkdirSync(dirname(join(root, op.path)), { recursive: true })
        writeFileSync(join(root, op.path), op.content, 'utf8')
      } else if (op.kind === 'remove') {
        rmSync(join(root, op.path), { force: true })
      } else {
        await run('git', ['-C', root, 'rm', '-q', '-r', '--', op.path])
      }
    } catch (error) {
      throw new Error(`migration stopped at "${op.kind} ${op.path}": ${String(error)}. ${plan.report.undo}`)
    }
  }
}


/** Whether a project's .gitmodules carries the code-server template (FR-122). */
export function carriesTemplateSubmodule(gitmodules: string | null): boolean {
  return gitmodules !== null && /path\s*=\s*\.code-server\s*$/m.test(gitmodules)
}

/**
 * Which tracked files the plan reads: text worth scanning for imports and
 * mentions, and never the submodule's own files.
 */
export function textsWorthReading(tracked: readonly string[]): string[] {
  return tracked.filter((f) => !f.startsWith('.code-server/') && /\.(md|sh|json|ya?ml|toml|py|ts|mjs|js)$|^\.githooks\//.test(f))
}
