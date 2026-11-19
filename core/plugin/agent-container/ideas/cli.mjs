// idea-check's body: one line per problem, `<file>:<line>: <message>`, or
// `<file>: <message>` when the problem is something missing, and exit 1 when
// there is any; silent and 0 on a valid idea; 2 on a usage error. An idea's
// folder is read as its IDEA.md.
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseIdea } from './contract.mjs'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('usage: idea-check <IDEA.md or idea folder>...  — checks an idea against its contract')
  process.exit(2)
}
let failed = false
for (const arg of args) {
  const file = existsSync(arg) && statSync(arg).isDirectory() ? join(arg, 'IDEA.md') : arg
  if (!existsSync(file)) {
    console.log(`${arg}: there is no IDEA.md here`)
    failed = true
    continue
  }
  for (const p of parseIdea(readFileSync(file, 'utf8')).problems) {
    console.log(p.line === null ? `${file}: ${p.message}` : `${file}:${p.line}: ${p.message}`)
    failed = true
  }
}
process.exit(failed ? 1 : 0)
