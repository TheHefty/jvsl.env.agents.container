import type { ProjectFiles } from '../host/files.ts'
import { parseIdea } from './contract.ts'
import { IDEAS_PATH } from './offer.ts'

/**
 * The original idea, marked once a project is created from it (story
 * a-project-is-created-from-a-ready-idea, gh-364; task a-project-from-an-idea-
 * copies-it-and-marks-the-original). Only the extension writes this state:
 * IDEATION.md tells the agent it never does.
 *
 * **Only the state line changes**, and the result is held to the contract
 * before it is written: a mark that broke the idea would turn the developer's
 * own record unreadable to Create and to the agent alike.
 */
export function markBecameProject(text: string, project: string): string | { error: string } {
  const close = text.search(/\r?\n---\r?\n/)
  const head = close < 0 ? '' : text.slice(0, close)
  const line = /^state:[^\r\n]*$/m.exec(head)
  if (!text.startsWith('---') || line === null) return { error: 'it has no state: line in its front matter to mark' }
  const marked = text.slice(0, line.index) + `state: became project: ${project}` + text.slice(line.index + line[0].length)
  const { idea, problems } = parseIdea(marked)
  if (problems.length > 0 || idea?.state !== 'became project') {
    return { error: `marked, it would not read as the contract says: ${problems.map((p) => p.message).join('; ')}` }
  }
  return marked
}

/**
 * Marks the idea in the developer's ideas folder, **as it is now**: read again
 * rather than from what was offered, so an edit made while Create asked its
 * questions is kept. Never throws; Create is not undone by a mark it could not
 * write, and the caller says so.
 */
export function markIdea(
  files: Pick<ProjectFiles, 'read' | 'write'>,
  slug: string,
  project: string,
): { ok: true } | { error: string } {
  const rel = `${IDEAS_PATH}/${slug}/IDEA.md`
  try {
    const text = files.read(rel)
    if (text === null) return { error: `the idea ${slug} is no longer in the ideas folder, so it was not marked` }
    const marked = markBecameProject(text, project)
    if (typeof marked !== 'string') return { error: `the idea ${slug} was not marked: ${marked.error}` }
    files.write(rel, marked)
    return { ok: true }
  } catch (error) {
    return { error: `the idea ${slug} could not be marked: ${String(error)}` }
  }
}
