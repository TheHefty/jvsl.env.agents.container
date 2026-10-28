// study-validate's body: one line per problem, `file: path: message`, and exit 1
// when there is any; silent and 0 on valid material. With more than one topic,
// each topic's problems follow a `<dir>:` line, so they can be told apart.
import { checkTopic } from './validate.mjs'

const dirs = process.argv.slice(2)
if (dirs.length === 0) {
  console.error('usage: study-validate <topic-dir>...  — checks study material against its contract')
  process.exit(2)
}
let failed = false
for (const dir of dirs) {
  const problems = checkTopic(dir)
  if (problems.length === 0) continue
  failed = true
  if (dirs.length > 1) console.log(`${dir}:`)
  for (const p of problems) console.log(`${p.file}: ${p.path || '/'}: ${p.message}`)
}
process.exit(failed ? 1 : 0)
