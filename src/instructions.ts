import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * What marks an instruction file as this extension's rather than somebody's.
 *
 * **An HTML comment is the only form with both properties that matter.** It is
 * invisible in rendered Markdown, so it does not clutter the first thing a
 * person reads; and it survives a formatter, which a YAML front-matter key does
 * not — some viewers render front matter as a table and some tools reorder its
 * keys. A trailing line was considered and rejected for being the first thing
 * deleted by anybody tidying the end of a file.
 *
 * Recognition is by the opening phrase rather than by the whole string, because
 * a reflowing editor will rewrap the comment and an exact match would then stop
 * recognising a file this extension itself wrote — which would make the next
 * upgrade refuse to replace its own output.
 */
export const MARKER = '<!-- jvsl.env.agents.vscode: generated.'

export function isGenerated(contents: string): boolean {
  return contents.trimStart().startsWith('<!--') && contents.includes('jvsl.env.agents.vscode: generated.')
}

export interface InstructionWrite {
  name: string
  action: 'write' | 'keep'
  /** Why, when it is not simply "it was absent". Always set for `keep`. */
  because?: string
  contents?: string
}

/** The two files a project receives, and what to do about each. */
export const INSTRUCTION_FILES = ['CLAUDE.md', 'AGENTS.md'] as const

/**
 * Decided rather than done, so the decision is testable without a filesystem to
 * clean up — the same reason `decideOpen` is a function over what the host looks
 * like.
 *
 * **A file this extension did not write is kept, and the reason names it.** Both
 * are tracked in a project's git and carry its own standing answers; the
 * reference monorepo's `CLAUDE.md` is 20 KiB of them. That is destructive in a
 * way the generated dev container configuration is not, because that file is
 * gitignored and disposable and these are neither.
 *
 * **One file being somebody's work does not make the pair untouchable.** A
 * project that wrote its own `CLAUDE.md` and has no `AGENTS.md` gets the second.
 */
export function instructionWrites(projectRoot: string, assetsDir: string): InstructionWrite[] {
  return INSTRUCTION_FILES.map((name): InstructionWrite => {
    const source = join(assetsDir, name)
    if (!existsSync(source)) {
      return {
        name,
        action: 'keep',
        because:
          `this installation does not carry ${name} at ${source}, which means the extension is ` +
          `incomplete rather than this project being unconfigured. Nothing was written: an empty ` +
          `instruction file is worse than an absent one, because an agent reads it.`,
      }
    }
    const target = join(projectRoot, name)
    if (existsSync(target)) {
      const existing = readOrEmpty(target)
      if (!isGenerated(existing)) {
        return {
          name,
          action: 'keep',
          because:
            `${name} is already there and this extension did not write it, so it is somebody's ` +
            `work. It is tracked in git and may carry this project's own standing answers. ` +
            `Nothing was written.`,
        }
      }
    }
    return { name, action: 'write', contents: readOrEmpty(source) }
  })
}

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}
