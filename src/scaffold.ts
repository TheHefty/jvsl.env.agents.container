import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { aiMemoryMarker } from './location.ts'
import { CONFIG_PATH } from './open.ts'
import { nextManifest, type Answers } from './questions.ts'

export interface ScaffoldInput {
  root: string
  assetsDir: string
  answers: Answers
  /** The person's own git identity, when git has one configured. */
  identity?: { name: string; email: string }
}

export interface ScaffoldWrite {
  /** Relative to the project root, so the plan is readable before it is applied. */
  path: string
  contents: string
}

export interface ScaffoldPlan {
  writes: ScaffoldWrite[]
  /** Whether the first commit is made. False when git has no identity. */
  commit: boolean
  /** Why there is no commit, or anything else worth saying. */
  note?: string
  /** Set when nothing will be written, naming what was found. */
  refused?: string
}

/**
 * What creating a project writes, decided before anything is written.
 *
 * **A list rather than a sequence of writes**, and that shape is what answers
 * the worst failure this task has. Five files go in: if the third write fails,
 * the directory is no longer empty — so trying again is refused by the very
 * check that was protecting it, and somebody is left with half a project and no
 * statement of what landed. A plan that is a list can be applied in full or
 * reported in full.
 *
 * **It checks the directory again.** `checkLocation` already refused a
 * non-empty one when the question was answered, and six questions pass between
 * then and here: a clone finishing, an editor saving, another window's
 * scaffolding. That first check exists so the questions are not wasted; this one
 * is the one that protects anything.
 */
export function scaffoldPlan(input: ScaffoldInput): ScaffoldPlan {
  const occupied = entriesOf(input.root)
  if (occupied.length > 0) {
    return {
      writes: [],
      commit: false,
      refused:
        `${input.root} holds ${occupied.slice(0, 3).join(', ')} and nothing was written. It was ` +
        `empty when the questions started, so something else has used it since.`,
    }
  }

  const writes: ScaffoldWrite[] = [
    {
      path: '.code-server.stack.json',
      // Through nextManifest, so a project created here and one configured
      // later agree about what a manifest looks like rather than this flow
      // inventing a second shape.
      contents: `${JSON.stringify(
        nextManifest({}, input.answers, Object.keys(input.answers.stacks)),
        null,
        2,
      )}\n`,
    },
    {
      path: '.gitignore',
      // **The line a sketch would miss.** `open.ts` refuses a project whose
      // .gitignore does not ignore the generated configuration, so a project
      // scaffolded without this is created and then declines to open. The test
      // asserts it against `ignoresGeneratedConfig` rather than against this
      // literal, so the writer and the refuser cannot drift apart.
      contents:
        `# Generated from this project's manifest and this machine's hardware: core count,\n` +
        `# memory, and which devices the host actually has. Committing it would carry one\n` +
        `# machine's answers to every other, and the extension refuses to open a project\n` +
        `# that does not ignore it.\n${CONFIG_PATH}\n`,
    },
  ]

  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    const contents = readOrNull(join(input.assetsDir, name))
    if (contents !== null) writes.push({ path: name, contents })
  }

  if (input.answers.aiMemory === true) {
    writes.push({ path: '.ai-memory.toml', contents: aiMemoryMarker() })
  }

  if (input.identity === undefined) {
    return {
      writes,
      commit: false,
      note:
        `git has no identity configured here, so the scaffolding is written and left uncommitted. ` +
        `Set \`user.name\` and \`user.email\` and commit it yourself — a first commit attributed ` +
        `to a guess is worse than no first commit.`,
    }
  }
  return { writes, commit: true }
}

function entriesOf(path: string): string[] {
  try {
    if (!statSync(path).isDirectory()) return [path]
    return readdirSync(path)
  } catch {
    return []
  }
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}
