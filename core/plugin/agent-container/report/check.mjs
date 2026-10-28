// report-check's body (story the-project-report): docs/REPORT.md in the shape
// the study skill reads and the developer can check. One `REPORT.md:<line>:`
// line per problem, exit 1 when there is any.
//
// What a script can hold: every claim cites a file that exists, or says it is an
// inference; a documented decision names its source; an implicit decision is
// given no motive, because none was recorded and inventing one is the failure
// the story names; a topic names the files it rests on. Whether a file says what
// the claim says is the developer's to check — the citation is what lets them.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const SECTIONS = ['Overview', 'Decisions', 'Critical areas', 'Quality and tests', 'Study list', 'Topics to write about']
const CLAIMS = new Set(['Overview', 'Critical areas', 'Quality and tests', 'Study list'])

const file = process.argv[2]
if (!file || !existsSync(file)) {
  console.error(`usage: report-check <docs/REPORT.md>${file ? ` — ${file} does not exist` : ''}`)
  process.exit(2)
}
let root = process.cwd()
try { root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim() } catch { /* not a repository: paths from here */ }

const problems = []
const say = (n, what) => problems.push(`REPORT.md:${n}: ${what}`)
const exists = (p) => existsSync(join(root, p.replace(/:\d+(-\d+)?$/, '')))
const cited = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1])

const lines = readFileSync(file, 'utf8').split('\n')
const found = []
let section = null
let sub = null
lines.forEach((line, i) => {
  const n = i + 1
  if (line.startsWith('## ')) { section = line.slice(3).trim(); sub = null; found.push({ section, n }); return }
  if (line.startsWith('### ')) { sub = line.slice(4).trim(); return }
  if (!line.startsWith('- ')) return
  const paths = cited(line).filter((c) => /[/.]/.test(c) && !/\s/.test(c))
  for (const p of paths) if (!exists(p)) say(n, `cites ${p}, which does not exist`)
  if (CLAIMS.has(section)) {
    if (!paths.some(exists) && !/\(inference\)\s*$/.test(line)) say(n, 'cites no file and is not marked (inference)')
  } else if (section === 'Decisions' && sub === 'Documented') {
    const m = line.match(/Source: `([^`]+)`/)
    if (!m) say(n, 'a documented decision names no Source: `<path>`')
  } else if (section === 'Decisions' && sub === 'Implicit') {
    if (/\bReason:/.test(line)) say(n, 'an implicit decision is given a Reason: none was recorded, so none is written')
    if (!/In: `[^`]+`/.test(line)) say(n, 'an implicit decision names no In: `<path>` where it lives')
  } else if (section === 'Topics to write about') {
    const m = line.match(/Files: (.+)$/)
    if (!m || cited(m[1]).length === 0) say(n, 'a topic names no Files: it rests on')
  }
})
for (const want of SECTIONS) if (!found.some((f) => f.section === want)) say(0, `has no "## ${want}" section`)
const order = found.map((f) => f.section).filter((s) => SECTIONS.includes(s))
if (SECTIONS.every((s) => order.includes(s)) && order.join('|') !== SECTIONS.join('|')) say(0, `has its sections out of order; they are ${SECTIONS.join(', ')}`)
const decisions = lines.join('\n')
if (order.includes('Decisions') && !(/^### Documented$/m.test(decisions) && /^### Implicit$/m.test(decisions))) say(0, 'Decisions needs both "### Documented" and "### Implicit"')

for (const p of problems) console.log(p)
process.exit(problems.length ? 1 : 0)
