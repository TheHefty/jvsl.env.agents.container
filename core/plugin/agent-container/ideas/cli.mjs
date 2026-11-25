// idea-check's body: one line per problem, `<file>:<line>: <message>`, or
// `<file>: <message>` when the problem is something missing, and exit 1 when
// there is any; silent and 0 on a valid idea; 2 on a usage error. An idea's
// folder is read as its IDEA.md.
//
// `idea-check --set <state> <idea>...` changes an idea's state, and only if the
// idea is valid in it (task the-ideation-skill-consolidates-before-ready): the
// check and the write are one step, so an idea the contract refuses as ready
// is never left ready. Only the state: line is rewritten; anything refused
// leaves the file byte for byte as it was. `became project` is the
// extension's to mark, and is never written here.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { IDEA_STATES, parseIdea } from './contract.mjs'

const USAGE =
  'usage: idea-check <IDEA.md or idea folder>...  — checks an idea against its contract\n' +
  `       idea-check --set <${IDEA_STATES.join('|')}> <IDEA.md or idea folder>...  — sets the state, only if the idea is valid in it`

const usage = (why) => {
  if (why) console.error(`idea-check: ${why}`)
  console.error(USAGE)
  process.exit(2)
}

let args = process.argv.slice(2)
let target = null
if (args[0] === '--set') {
  target = args[1]
  args = args.slice(2)
  if (target === undefined) usage('--set needs a state')
  if (/^became project/.test(target)) {
    usage('became project is marked by the extension, when Create project starts from the idea; idea-check never writes it')
  }
  if (!IDEA_STATES.includes(target)) usage(`"${target}" is not a state an idea can be set to`)
}
if (args.length === 0) usage()

const fileOf = (arg) => (existsSync(arg) && statSync(arg).isDirectory() ? join(arg, 'IDEA.md') : arg)
const report = (file, problems) => {
  for (const p of problems) console.log(p.line === null ? `${file}: ${p.message}` : `${file}:${p.line}: ${p.message}`)
}

let failed = false
for (const arg of args) {
  const file = fileOf(arg)
  if (!existsSync(file)) {
    console.log(`${arg}: there is no IDEA.md here`)
    failed = true
    continue
  }
  const text = readFileSync(file, 'utf8')
  const { idea, problems } = parseIdea(text)
  if (target === null) {
    report(file, problems)
    if (problems.length > 0) failed = true
    continue
  }

  // --set: the idea has to be readable as it is, and valid in the new state.
  if (idea === null) {
    report(file, problems)
    console.log(`${file}: its state was not changed`)
    failed = true
    continue
  }
  const from = idea.state === 'became project' ? `became project: ${idea.project}` : idea.state
  if (idea.state === 'became project') {
    console.log(`${file}: became project: ${idea.project}; its state is the extension's, and was not changed`)
    failed = true
    continue
  }
  const lines = text.split('\n')
  const close = lines.findIndex((l, i) => i > 0 && l.replace(/\r$/, '') === '---')
  const at = lines.findIndex((l, i) => i > 0 && i < close && /^state:/.test(l))
  lines[at] = `state: ${target}${lines[at].endsWith('\r') ? '\r' : ''}`
  const next = lines.join('\n')
  const after = parseIdea(next).problems
  if (after.length > 0) {
    report(file, after)
    console.log(`${file}: its state was not changed, and is still ${from}`)
    failed = true
    continue
  }
  if (next !== text) writeFileSync(file, next)
  console.log(`${file}: ${from} -> ${target}`)
}
process.exit(failed ? 1 : 0)
