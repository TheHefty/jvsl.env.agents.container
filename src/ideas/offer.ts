import type { ProjectFiles } from '../host/files.ts'
import { parseIdea, type Idea } from './contract.ts'

/**
 * The ready ideas *Create project* can start from (story a-project-is-created-
 * from-a-ready-idea, gh-364; task create-offers-ready-ideas-and-preselects-
 * their-stacks).
 *
 * Ideas live in the developer's scope, `~/.claude/agent-container/ideas/<slug>/
 * IDEA.md` — the distro user's home on WSL, as the journal. They are read
 * through the same files the journal setting is, rooted at that home, and
 * checked by the one contract the agent checks them with in the container.
 *
 * **Nothing here can stop Create.** A folder that is not there is the common
 * case and says nothing; an idea outside the contract, a folder with no
 * IDEA.md, or a read that fails is named for the output channel and not
 * offered. Hidden entries are not ideas: the Brainstorm command keeps its
 * memory marker there.
 */
export const IDEAS_PATH = '.claude/agent-container/ideas'

export interface ReadyIdea { slug: string; idea: Idea; /** IDEA.md as read, copied into a project created from it. */ text: string }

export function readIdeas(files: Pick<ProjectFiles, 'list' | 'read'>): { ready: ReadyIdea[]; unreadable: string[] } {
  let entries: string[] | null
  try {
    entries = files.list(IDEAS_PATH)
  } catch (error) {
    return { ready: [], unreadable: [`the ideas folder could not be listed: ${String(error)}`] }
  }
  const ready: ReadyIdea[] = []
  const unreadable: string[] = []
  for (const slug of entries ?? []) {
    if (slug.startsWith('.')) continue
    let text: string | null
    try {
      text = files.read(`${IDEAS_PATH}/${slug}/IDEA.md`)
    } catch (error) {
      unreadable.push(`${slug}: its IDEA.md could not be read: ${String(error)}`)
      continue
    }
    if (text === null) { unreadable.push(`${slug}: there is no IDEA.md in it`); continue }
    const { idea, problems } = parseIdea(text)
    if (problems.length > 0 || idea === null) {
      unreadable.push(`${slug}: ${problems.map((p) => (p.line === null ? p.message : `line ${p.line} ${p.message}`)).join('; ')}`)
      continue
    }
    if (idea.state === 'ready') ready.push({ slug, idea, text })
  }
  return { ready, unreadable }
}

/**
 * The stacks question's starting point, from the idea's `stacks:` map. Only a
 * stack the extension offers is pre-selected, and only a version that stack
 * offers is carried: anything else is a note, said rather than guessed at, so
 * the build cannot fail later on something the idea named loosely.
 * `undecided` pre-selects the stack and leaves its version to the question.
 */
export function preselect(
  idea: Idea,
  available: readonly string[],
  versionsOf: (stack: string) => readonly string[],
): { stacks: string[]; versions: Record<string, string>; notes: string[] } {
  const stacks: string[] = []
  const versions: Record<string, string> = {}
  const notes: string[] = []
  for (const [stack, version] of Object.entries(idea.stacks)) {
    if (!available.includes(stack)) { notes.push(`the idea names the stack ${stack}, which is not one Create offers; it was not selected`); continue }
    stacks.push(stack)
    if (version === 'undecided') continue
    if (versionsOf(stack).includes(version)) versions[stack] = version
    else notes.push(`the idea names ${stack} ${version}, a version the stack does not offer; pick one`)
  }
  return { stacks, versions, notes }
}

/** The stacks question's items, those the idea named already picked. */
export function stackItems(available: readonly string[], preselected: readonly string[]): { label: string; picked: boolean }[] {
  return available.map((label) => ({ label, picked: preselected.includes(label) }))
}
