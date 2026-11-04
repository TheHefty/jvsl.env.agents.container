// md-split-plan [--apply] [--keep <heading>]... <file.md>
//
// Plans — and, with --apply, performs — the split the rules prescribe for a
// Markdown file that reached the size limit (RULES.md, "Documentation"; story
// a-markdown-file-that-grew-past-the-limit-is-split-by-its-subjects): a folder
// named for the subject, one file per top-level section, a README.md that
// indexes them, every inbound link updated, and the old path left as a one-line
// pointer — never as a second copy.
//
// **The deterministic part is here so it can be tested, and the bytes are never
// the agent's to retype.** Each new file is a slice of the original, cut at a
// heading, with only its links rewritten; the test reassembles them and
// compares. Without --apply it writes nothing and prints the plan as JSON: the
// split-markdown skill shows that to the developer and applies it on their word.
//
// CLAUDE.md is exempt from the folder rule, not from the limit: it is what the
// agent loads by name, so it keeps its preamble and the sections named with
// --keep in its own body, and imports the rest with @path. CHANGELOG.md is
// exempt altogether. A single section still over the limit is reported, and
// --apply refuses until it is split by its own subsections.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { basename, posix } from 'node:path'

const LIMIT = Number(process.env.LIMIT_KIB ?? 50) * 1024

function fail(message) {
  process.stderr.write(`md-split-plan: ${message}\n`)
  process.exit(1)
}

const args = process.argv.slice(2)
let apply = false
const keep = []
let file
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--apply') apply = true
  else if (args[i] === '--keep') keep.push(args[++i] ?? '')
  else file = args[i]
}
if (file === undefined) fail('usage: md-split-plan [--apply] [--keep <heading>]... <file.md>')
file = posix.normalize(file.replace(/\\/g, '/'))
if (basename(file) === 'CHANGELOG.md') {
  fail('CHANGELOG.md is exempt from the size rule: it only grows, and release-please writes it. Nothing was planned.')
}
if (!existsSync(file)) fail(`${file} does not exist. Run this from the repository's root, with the path git knows it by.`)

const isClaude = basename(file) === 'CLAUDE.md'
const text = readFileSync(file, 'utf8')

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to dashes. */
export function slug(heading) {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}

/** Every ATX heading outside a fenced code block, with its offset in the text. */
function headings(source) {
  const found = []
  let fence = null
  let offset = 0
  for (const line of source.split(/(?<=\n)/)) {
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence !== null) {
      if (open !== null && open[1][0] === fence[0] && open[1].length >= fence.length && line.trim() === open[1]) fence = null
    } else if (open !== null) {
      fence = open[1]
    } else {
      const h = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t#]*\r?\n?$/.exec(line)
      if (h !== null) found.push({ level: h[1].length, title: h[2], offset })
    }
    offset += line.length
  }
  return found
}

const all = headings(text)
// The top-level sections: under a single H1 title, its H2s; otherwise the H1s.
const level = all.filter((h) => h.level === 1).length === 1 ? 2 : 1
const tops = all.filter((h) => h.level === level)
if (tops.length < 2) fail(`${file} has fewer than two top-level sections (level ${level}), so there is nothing to split it by.`)

const dir = posix.dirname(file)
const folderName = isClaude ? 'claude' : basename(file, '.md').toLowerCase()
const folder = posix.join(dir, folderName)
const index = isClaude ? file : posix.join(folder, 'README.md')

const preamble = text.slice(0, tops[0].offset)
const sections = tops.map((h, i) => {
  const end = i + 1 < tops.length ? tops[i + 1].offset : text.length
  const body = text.slice(h.offset, end)
  const anchors = all.filter((x) => x.offset >= h.offset && x.offset < end).map((x) => slug(x.title))
  const kept = isClaude && keep.includes(h.title)
  return { heading: h.title, file: kept ? file : posix.join(folder, `${slug(h.title)}.md`), kept, start: h.offset, end, bytes: Buffer.byteLength(body), anchors, body }
})
const oversized = sections.filter((s) => !s.kept && s.bytes > LIMIT).map((s) => s.heading)

/** Where an anchor of the original file lives after the split. */
function home(anchor) {
  const section = anchor === '' ? undefined : sections.find((s) => s.anchors.includes(anchor))
  return section === undefined ? index : section.file
}

const external = (href) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('<')

/** A link written in `from` (now living in `at`), rewritten for the split. */
function rewrite(href, from, at) {
  if (external(href)) return href
  const [path, anchor = ''] = href.split('#')
  const resolved = path === '' ? from : posix.normalize(posix.join(posix.dirname(from), path))
  if (resolved === file) {
    const target = home(anchor)
    if (target === at && anchor !== '') return `#${anchor}`
    const rel = posix.relative(posix.dirname(at), target) || basename(target)
    return anchor === '' ? rel : `${rel}#${anchor}`
  }
  if (path === '' || posix.dirname(at) === posix.dirname(from)) return href
  const rel = posix.relative(posix.dirname(at), resolved)
  return anchor === '' ? rel : `${rel}#${anchor}`
}

const LINK = /\]\(([^)\s]+)\)/g
const relink = (body, from, at) => body.replace(LINK, (m, href) => `](${rewrite(href, from, at)})`)

const tracked = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' }).split('\n').filter((f) => f !== '' && f !== file)
const inbound = []
for (const other of tracked) {
  const content = readFileSync(other, 'utf8')
  const next = relink(content, other, other)
  if (next !== content) inbound.push({ file: other, content: next })
}

const plan = {
  file,
  limit: LIMIT,
  bytes: Buffer.byteLength(text),
  folder,
  index,
  sections: sections.map(({ heading, file: f, kept, bytes }) => ({ heading, file: f, kept, bytes, over: bytes > LIMIT })),
  oversized,
  links: inbound.map((i) => i.file),
}

if (!apply) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
  process.exit(0)
}

if (oversized.length > 0) {
  fail(`not applied: ${oversized.map((h) => `"${h}"`).join(', ')} alone is over ${LIMIT / 1024} KiB, so its file would be too. Split that section by its own subsections first. Nothing was written.`)
}

mkdirSync(folder, { recursive: true })
for (const s of sections.filter((x) => !x.kept)) writeFileSync(s.file, relink(s.body, file, s.file))
if (isClaude) {
  const keptBodies = sections.filter((s) => s.kept).map((s) => s.body).join('')
  const imports = sections.filter((s) => !s.kept).map((s) => `@${posix.relative(dir, s.file)}`).join('\n')
  writeFileSync(file, `${preamble}${keptBodies}${keptBodies.endsWith('\n\n') ? '' : '\n'}${imports}\n`)
} else {
  const list = sections.map((s) => `- [${s.heading}](${basename(s.file)})`).join('\n')
  writeFileSync(index, `${relink(preamble, file, index)}${preamble.endsWith('\n\n') ? '' : '\n'}${list}\n`)
  writeFileSync(file, `Moved to [${folderName}/README.md](${folderName}/README.md), one file per section.\n`)
}
for (const i of inbound) writeFileSync(i.file, i.content)
process.stdout.write(`${JSON.stringify({ ...plan, applied: true }, null, 2)}\n`)
