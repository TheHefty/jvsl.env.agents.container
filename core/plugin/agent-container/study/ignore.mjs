// study-ignore's body: the .gitignore rule the Study view applies too, from one
// source (withAttemptsIgnored in validate.mjs).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { withAttemptsIgnored } from './validate.mjs'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: study-ignore <docs/study>')
  process.exit(2)
}
mkdirSync(dir, { recursive: true })
const file = join(dir, '.gitignore')
const before = existsSync(file) ? readFileSync(file, 'utf8') : null
const after = withAttemptsIgnored(before)
if (after !== before) writeFileSync(file, after)
