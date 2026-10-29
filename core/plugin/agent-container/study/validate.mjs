// The study material's contract, checked (story the-study-material-has-a-contract).
//
// Since 2026-10-28 a topic is its guide alone (task the-practice-leaves-the-study):
// `docs/study/<slug>/guide.md`, with seven sections in order. Whatever else a
// topic built before then still carries from its practice is ignored, not
// refused: it is the developer's, and nothing reads it any more.
//
// One file, read by both sides: the study skill runs it in the container
// (bin/study-validate) and the extension bundles it for the Study view, so the
// two cannot disagree about what a valid topic is.

import { readFileSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'

export const GUIDE_SECTIONS = ['The problem', 'Fundamentals', 'What goes wrong without it', 'How the project solves it',
  'Trade-offs', 'Sources', 'Points for the post']

/** Every problem with the topic in `dir`, each with its file; none when it is valid. */
export function checkTopic(dir) {
  const read = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null)
  return checkTopicWith(read, basename(dir), dir)
}

/**
 * The same check, with the topic's files read through `read(name)` — null when a
 * file is not there. The Study view reads a WSL project through the distro, not
 * through node's fs, so it brings its own reader. Nothing here is evaluated at
 * import: bundled as CommonJS, the module's own path does not exist.
 */
export function checkTopicWith(read, folder, where = folder) {
  const guide = read('guide.md')
  if (guide === null) return [{ file: 'guide.md', path: '', rule: 'missing', message: `is missing from ${where}` }]
  const problems = []
  const headings = guide.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim())
  for (const want of GUIDE_SECTIONS) {
    if (!headings.includes(want)) problems.push({ file: 'guide.md', path: '', rule: 'section', message: `has no "## ${want}" section` })
  }
  const order = headings.filter((h) => GUIDE_SECTIONS.includes(h))
  if (GUIDE_SECTIONS.every((s) => order.includes(s)) && order.join('|') !== GUIDE_SECTIONS.join('|')) {
    problems.push({ file: 'guide.md', path: '', rule: 'order', message: `has its sections out of order; they are ${GUIDE_SECTIONS.join(', ')}` })
  }
  return problems
}
