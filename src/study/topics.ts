/**
 * The Study view's rows (story the-study-view), as a function of the topic
 * folders and the tracker.
 *
 * **Every topic folder is a row, whatever else is true.** A topic that breaks
 * its contract is a row with its first problem; one nobody tracked is "not
 * tracked"; with the tracker unreachable, every topic is still listed, its state
 * unknown and the reason said. A list that looks complete and is not is the
 * worse failure.
 *
 * A topic's task is found by its metadata `study=<slug>`, never by its title,
 * which can be edited (study-track writes it so).
 */
import type { Item } from '../board/board-read.ts'
import type { ProjectFiles } from '../host/files.ts'
import { checkTopicWith, type TopicProblem } from './contract.ts'

export const STUDY_DIR = 'docs/study'

export interface TopicFolder {
  slug: string
  title: string
  problems: TopicProblem[]
}

export type StudyState = 'not studied' | 'studying' | 'ready to write' | 'published' | 'not tracked' | 'unknown'

export interface TopicRow {
  slug: string
  label: string
  state: StudyState
  detail: string
  problem?: string
}

export type TrackerView = { ok: true; items: readonly Item[] } | { ok: false; why: string }

function stateOf(item: Item | undefined): StudyState {
  if (item === undefined) return 'not tracked'
  if (item.status === 'closed') return 'published'
  if (item.labels.includes('ready-to-write')) return 'ready to write'
  if (item.status === 'in_progress') return 'studying'
  return 'not studied'
}

export function topicRows(folders: readonly TopicFolder[], tracker: TrackerView): TopicRow[] {
  return [...folders]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((f) => {
      const item = tracker.ok ? tracker.items.find((i) => i.labels.includes('study') && i.metadata?.['study'] === f.slug) : undefined
      const state: StudyState = tracker.ok ? stateOf(item) : 'unknown'
      const first = f.problems[0]
      const problem = first === undefined ? undefined : `${first.file}: ${first.path || '/'}: ${first.message}`
      const detail = problem !== undefined
        ? `broken — ${problem}`
        : tracker.ok ? state : `state unknown — ${tracker.why}`
      return { slug: f.slug, label: f.title, state, detail, ...(problem === undefined ? {} : { problem }) }
    })
}

/** The topic folders under docs/study/, each checked against the contract through the project's own files. */
export function readTopics(files: ProjectFiles): TopicFolder[] {
  const entries = files.list(STUDY_DIR) ?? []
  return entries
    .filter((e) => !e.startsWith('.') && files.exists(`${STUDY_DIR}/${e}/guide.md`))
    .map((slug) => {
      const read = (name: string) => files.read(`${STUDY_DIR}/${slug}/${name}`)
      const guide = read('guide.md') ?? ''
      const heading = guide.split('\n').find((l) => l.startsWith('# '))
      return { slug, title: heading === undefined ? slug : heading.slice(2).trim(), problems: checkTopicWith(read, slug, `${STUDY_DIR}/${slug}`) }
    })
}
