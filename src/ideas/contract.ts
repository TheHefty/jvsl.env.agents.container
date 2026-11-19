/**
 * IDEA.md's contract, held on the host (story the-ideas-have-a-contract, gh-364;
 * task the-idea-contract-is-held-on-the-host).
 *
 * An idea is `ideas/<slug>/IDEA.md`: a front matter, then four sections. The
 * front matter is a **strict subset, not YAML** (agreed 2026-11-18, so the
 * extension takes no YAML dependency):
 *
 * ```
 * ---
 * state: raw | exploring | ready | discarded | became project: <name>
 * stacks:
 *   <name>: <version, or undecided>
 * ---
 * ```
 *
 * `stacks` is optional and one level deep. Anything outside the subset — an
 * unknown key, a list, a nested map, a key twice — is refused naming its line,
 * because a parser that guesses at what it does not understand is how a
 * hand-edited idea comes back with a different meaning. An idea in any state
 * may lack sections while it is being shaped; a `ready` one has all four, each
 * with something in it, because Create project starts from it.
 *
 * The examples the tests read are in core/plugin/agent-container/ideas/examples,
 * where the plugin's own checker (5kd.1.2) reads the same files.
 */

export const IDEA_SECTIONS = [
  'Purpose and who it is for',
  'Decisions and discarded alternatives',
  'Stack',
  'Open questions',
] as const
export type IdeaSection = (typeof IDEA_SECTIONS)[number]

export const IDEA_STATES = ['raw', 'exploring', 'ready', 'discarded'] as const
export type IdeaState = (typeof IDEA_STATES)[number] | 'became project'

export interface Idea {
  state: IdeaState
  /** The project it became, when the state is `became project`. */
  project?: string
  /** Stack name to version, or to `undecided`. */
  stacks: Record<string, string>
  /** Each section present, by name, with its text trimmed. */
  sections: Partial<Record<IdeaSection, string>>
  /** The line each present section's heading is on, 1-based. */
  sectionLines: Partial<Record<IdeaSection, number>>
}

export interface IdeaProblem {
  /** The 1-based line the problem is on, or null when it is something missing. */
  line: number | null
  message: string
}

const KEY = /^([a-z][a-z0-9-]*):(?:[ \t]+(.*))?$/
const STACK = /^ {2}([a-z][a-z0-9.+-]*):(?:[ \t]+(.*))?$/

/** The idea in `text`, and every problem with it; `idea` is null when the front matter cannot be read. */
export function parseIdea(text: string): { idea: Idea | null; problems: IdeaProblem[] } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.replace(/[ \t]+$/, ''))
  if (lines[0] !== '---') {
    return { idea: null, problems: [{ line: 1, message: 'does not start with a front matter: the first line has to be ---' }] }
  }
  const close = lines.indexOf('---', 1)
  if (close < 0) {
    return { idea: null, problems: [{ line: 1, message: 'has a front matter that is never closed: no second --- line' }] }
  }

  const problems: IdeaProblem[] = []
  let state: IdeaState | null = null
  let project: string | undefined
  const stacks: Record<string, string> = {}
  const seen = new Set<string>()
  let inStacks = false
  let stateGiven = false

  for (let i = 1; i < close; i++) {
    const raw = lines[i] ?? ''
    const n = i + 1
    if (raw === '') { inStacks = false; continue }

    if (raw.startsWith(' ') || raw.startsWith('\t')) {
      if (!inStacks) { problems.push({ line: n, message: 'is indented, and only the entries under stacks: are' }); continue }
      const m = STACK.exec(raw)
      if (!m) {
        problems.push({ line: n, message: 'is not a stack: an entry under stacks: is "  name: version", or "  name: undecided"' })
        continue
      }
      const [, name = '', value = ''] = m
      if (value === '') {
        const next = lines[i + 1] ?? ''
        if (i + 1 < close && /^ {3,}\S/.test(next)) {
          problems.push({ line: n + 1, message: `nests under stack ${name}: stacks is one level, "name: version"` })
          while (i + 1 < close && /^ {3,}\S/.test(lines[i + 1] ?? '')) i++
        } else {
          problems.push({ line: n, message: `gives stack ${name} no version: write one, or undecided` })
        }
        continue
      }
      if (name in stacks) { problems.push({ line: n, message: `names stack ${name} twice` }); continue }
      stacks[name] = value
      continue
    }

    inStacks = false
    const m = KEY.exec(raw)
    if (!m) { problems.push({ line: n, message: 'is not "key: value"; the front matter holds state: and stacks: only' }); continue }
    const [, key = '', value = ''] = m
    if (seen.has(key) && (key === 'state' || key === 'stacks')) { problems.push({ line: n, message: `gives ${key} twice` }); continue }
    seen.add(key)
    if (key === 'state') {
      stateGiven = true
      const became = /^became project:(.*)$/.exec(value)
      if (became) {
        const name = (became[1] ?? '').trim()
        if (name === '') problems.push({ line: n, message: 'says became project: with no project named after it' })
        else { state = 'became project'; project = name }
      } else if ((IDEA_STATES as readonly string[]).includes(value)) {
        state = value as IdeaState
      } else {
        problems.push({ line: n, message: `gives state ${value === '' ? 'no value' : `"${value}"`}; it is one of raw, exploring, ready, discarded, or became project: <name>` })
      }
    } else if (key === 'stacks') {
      if (value !== '') problems.push({ line: n, message: 'puts a value after stacks:; its entries go on the lines under it, "  name: version"' })
      else inStacks = true
    } else {
      problems.push({ line: n, message: `has the key ${key}, which is not part of the contract; the front matter holds state: and stacks: only` })
    }
  }

  if (!stateGiven) {
    problems.push({ line: null, message: 'has no state: in its front matter' })
  }

  const sections: Partial<Record<IdeaSection, string>> = {}
  const sectionLines: Partial<Record<IdeaSection, number>> = {}
  let current: IdeaSection | null = null
  let body: string[] = []
  const flush = (): void => { if (current) sections[current] = body.join('\n').trim() }
  for (let i = close + 1; i < lines.length; i++) {
    const l = lines[i] ?? ''
    if (/^#{1,2} /.test(l)) {
      flush()
      const title = l.startsWith('## ') ? l.slice(3).trim() : ''
      current = (IDEA_SECTIONS as readonly string[]).includes(title) ? (title as IdeaSection) : null
      if (current) sectionLines[current] = i + 1
      body = []
    } else if (current) {
      body.push(l)
    }
  }
  flush()

  if (problems.length > 0 || state === null) return { idea: null, problems }
  const idea: Idea = { state, stacks, sections, sectionLines, ...(project ? { project } : {}) }
  if (state === 'ready') problems.push(...readyProblems(idea))
  return { idea, problems }
}

/** What stands between `idea` and ready: each of the four sections missing, or empty. */
export function readyProblems(idea: Idea): IdeaProblem[] {
  const problems: IdeaProblem[] = []
  for (const s of IDEA_SECTIONS) {
    const text = idea.sections[s]
    if (text === undefined) {
      problems.push({ line: null, message: `cannot be ready: it has no "## ${s}" section` })
    } else if (text.replace(/<!--[\s\S]*?-->/g, '').trim() === '') {
      problems.push({ line: idea.sectionLines[s] ?? null, message: `cannot be ready: its "## ${s}" section is empty` })
    }
  }
  return problems
}
