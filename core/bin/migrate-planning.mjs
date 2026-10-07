#!/usr/bin/env node
// Moves a project's epics, stories, tasks and debts into its tracker, then
// removes docs/PLANNING and docs/DEBTS (FR-125, FR-126; story
// the-planning-moves-into-the-tracker in the tracker).
//
// **Plain JavaScript, on purpose.** It runs inside a project's container,
// where bd is, on whichever Node the project's stack installed (18, 22 or 24);
// python3 is not guaranteed in the image. src/migrate-planning.test.ts drives
// it as a program against a stand-in bd.
//
// **Measured on fresh clones of fahrenheit404, gosnip and kotodori on
// 2026-10-07**: epics are a README.md, an OVERVIEW.md or only a folder; state
// lives in each document (a task's `status:` front matter, a story's or epic's
// `| **Status** |` row) more than in the parent's table; debts are a folder or
// a single file, with a Kind row.
//
// **The order is the safety property**: plan, create every item, read every
// one back, close children before parents, and only then delete the folders.
// Nothing is committed.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FINISHED = /\b(done|complete|completed|built|shipped|implemented|implementada|implementado|conclu[ií]d[ao])\b/i
const SUPERSEDED = /\b(superseded|refiled|migrated|substitu[ií]d[ao])\b/i
const DRAFT = /^\s*(draft|rascunho)\b/i
const ON_HOLD = /^\s*(on hold|em espera|paused|pausad[ao])\b/i
const ACCEPTED = /^\s*(accepted|aceit[ao]|approved|aprovad[ao])\b/i

/**
 * The item's state, from what its document recorded. Only the first clause
 * counts (up to an em dash, comma or full stop), and finished words are looked
 * for first, so "Accepted and shipped" is finished.
 */
export function stateFrom(text) {
  if (text === undefined || text.trim() === '') return { state: 'open', reason: '', known: false }
  const raw = text.replace(/\*\*/g, '').trim()
  const clause = raw.split(/\s+[—–]\s+|[,.;]\s/)[0]
  if (SUPERSEDED.test(clause)) return { state: 'closed', reason: `superseded: ${raw}`, known: true }
  if (FINISHED.test(clause)) return { state: 'closed', reason: raw, known: true }
  if (DRAFT.test(clause)) return { state: 'proposal', reason: '', known: true }
  if (ON_HOLD.test(clause)) return { state: 'deferred', reason: '', known: true }
  if (ACCEPTED.test(clause)) return { state: 'open', reason: '', known: true }
  return { state: 'open', reason: '', known: false }
}

/** A document's own status: `status:` in front matter, or a `| **Status** | … |` row. */
export function ownStatus(text) {
  const front = /^---\n([\s\S]*?)\n---/.exec(text)
  if (front) {
    const m = /^status:\s*(.+?)\s*(#.*)?$/m.exec(front[1])
    if (m) return m[1]
  }
  const row = /^\|\s*\*\*Status\*\*\s*\|\s*(.*?)\s*\|\s*$/m.exec(text)
  return row ? row[1] : undefined
}

/** (link target, Status cell) for each row of each table with a Status column. */
function tableStatuses(text) {
  const out = new Map()
  let at = null
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) { at = null; continue }
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    if (at === null) { at = cells.map((c) => c.toLowerCase()).indexOf('status'); continue }
    if (at < 0 || /^[-:\s|]*$/.test(cells.join(''))) continue
    const link = /\]\(([^)]+)\)/.exec(cells[1] ?? '')
    if (link && cells[at] !== undefined) out.set(basename(link[1].replace(/\/$/, '')), cells[at].replace(/\*\*/g, '').trim())
  }
  return out
}

const read = (p) => readFileSync(p, 'utf8')
const isDir = (p) => existsSync(p) && statSync(p).isDirectory()
const firstExisting = (dir, names) => names.map((n) => join(dir, n)).find((p) => existsSync(p))

/** Builds the plan: one row per item, parents before children, nothing written. */
export function plan(root) {
  const P = join(root, 'docs/PLANNING')
  const D = join(root, 'docs/DEBTS')
  const rows = []
  const listed = []
  const index = existsSync(join(P, 'README.md')) ? tableStatuses(read(join(P, 'README.md'))) : new Map()

  for (const epic of isDir(P) ? readdirSync(P).sort() : []) {
    const edir = join(P, epic)
    if (!isDir(edir)) continue
    const edoc = firstExisting(edir, ['README.md', 'OVERVIEW.md'])
    const etext = edoc ? read(edoc) : ''
    const parentTable = new Map([...index, ...(edoc ? tableStatuses(etext) : [])])
    const stories = readdirSync(edir).sort().filter((s) => existsSync(join(edir, s, 'OVERVIEW.md')))
    if (!edoc && stories.length === 0) continue
    const erow = { key: epic, kind: 'epic', type: 'epic', parent: null, title: epic, path: edoc,
      body: etext || `# Epic: ${epic}\n\n(no document; its stories are below)`, labels: [], state: 'open', reason: '' }
    rows.push(erow)
    const storyRows = []
    for (const story of stories) {
      const sdir = join(edir, story)
      const stext = read(join(sdir, 'OVERVIEW.md'))
      const sstatus = ownStatus(stext) ?? parentTable.get(story)
      const s = stateFrom(sstatus)
      if (!s.known) listed.push(`story ${epic}/${story}: state not recognised (${sstatus ?? 'none recorded'}), left open`)
      const feature = join(sdir, `${story}.feature`)
      const srow = { key: `${epic}/${story}`, kind: 'story', type: 'feature', parent: epic, title: story,
        path: join(sdir, 'OVERVIEW.md'), body: stext, acceptance: existsSync(feature) ? read(feature) : undefined,
        labels: s.state === 'proposal' ? ['proposed'] : [], state: s.state, reason: s.reason, statusText: sstatus }
      rows.push(srow)
      storyRows.push(srow)
      const tdir = join(sdir, 'tasks')
      const ttable = tableStatuses(stext)
      for (const task of isDir(tdir) ? readdirSync(tdir).sort().filter((t) => t.endsWith('.md')) : []) {
        const ttext = read(join(tdir, task))
        const name = task.replace(/\.md$/, '')
        const tstatus = ownStatus(ttext) ?? ttable.get(task) ?? ttable.get(`tasks/${task}`)
        let t = tstatus === undefined ? { ...s, known: true } : stateFrom(tstatus)
        if (tstatus !== undefined && !t.known) listed.push(`task ${epic}/${story}/${name}: state not recognised (${tstatus}), left open`)
        if (tstatus === undefined && s.state === 'closed') t = { state: 'closed', reason: `closed with its story: ${sstatus}`, known: true }
        // A finished story cannot be closed while a task under it is open:
        // the task closes with it, and the run says so (decided 2026-10-07).
        if (s.state === 'closed' && t.state !== 'closed') {
          t = { state: 'closed', reason: `closed with its story: ${sstatus}; the task recorded ${tstatus ?? 'nothing'}`, known: true }
          listed.push(`task ${epic}/${story}/${name}: closed with its finished story (it recorded ${tstatus ?? 'nothing'})`)
        }
        rows.push({ key: `${epic}/${story}/${name}`, kind: 'task', type: 'task', parent: `${epic}/${story}`, title: name,
          path: join(tdir, task), body: ttext, labels: t.state === 'proposal' ? ['proposed'] : [], state: t.state, reason: t.reason })
      }
    }
    // An epic's own text is kept in its description, not read as a state: it
    // closes when every story under it does (FR-125).
    if (storyRows.length > 0 && storyRows.every((s) => s.state === 'closed')) {
      erow.state = 'closed'
      erow.reason = 'every story under it is closed'
    }
  }

  for (const entry of isDir(D) ? readdirSync(D).sort() : []) {
    // README.md is the folder's index, never a debt: gosnip's migration took it
    // for one (debt the-migration-takes-the-debts-index-for-a-debt).
    if (entry === 'README.md') continue
    const doc = isDir(join(D, entry)) ? join(D, entry, 'OVERVIEW.md') : entry.endsWith('.md') ? join(D, entry) : null
    if (!doc || !existsSync(doc)) continue
    const text = read(doc)
    const kindRow = /^\|\s*\*\*Kind\*\*\s*\|\s*(.*?)\s*\|\s*$/m.exec(text)
    const kind = /^\s*hotfix\b/i.test(kindRow?.[1] ?? '') ? 'hotfix' : /^\s*shortcut\b/i.test(kindRow?.[1] ?? '') ? 'shortcut' : 'defect'
    const status = ownStatus(text) ?? ''
    const closed = /^\s*(paid|closed|fixed|done)\b/i.test(status.replace(/\*\*/g, ''))
    rows.push({ key: `debt:${entry}`, kind: 'debt', type: 'bug', parent: null, title: entry.replace(/\.md$/, ''),
      path: doc, body: text, labels: [kind], state: closed ? 'closed' : 'open', reason: closed ? status.replace(/\*\*/g, '').trim() : '' })
  }
  return { rows, listed }
}

function say(rows, listed) {
  const count = (k) => rows.filter((r) => r.kind === k).length
  const closed = rows.filter((r) => r.state === 'closed').length
  console.log(`migrate-planning: ${rows.length} item(s): ${count('epic')} epic(s), ${count('story')} story(ies), ${count('task')} task(s), ${count('debt')} debt(s); ${closed} closed.`)
  if (listed.length > 0) {
    console.log('\n== read these before the real run')
    for (const l of listed) console.log(`  ${l}`)
  }
}

const bd = (args) => execFileSync('bd', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const strip = (s) => (s ?? '').replace(/\n+$/, '')

export function main(argv, root = process.cwd()) {
  const { rows, listed } = plan(root)
  if (rows.length === 0) {
    console.log('migrate-planning: nothing to migrate: no docs/PLANNING or docs/DEBTS here.')
    return 0
  }
  say(rows, listed)
  if (argv.includes('--plan')) return 0

  const tmp = mkdtempSync(join(tmpdir(), 'migrate-planning-'))
  const ids = new Map()
  try {
    for (const r of rows) {
      const bodyFile = join(tmp, 'body')
      writeFileSync(bodyFile, r.body)
      const args = ['create', r.title, '--type', r.type, '--body-file', bodyFile, '--json']
      if (r.parent) args.push('--parent', ids.get(r.parent))
      if (r.labels.length > 0) args.push('--labels', r.labels.join(','))
      if (r.state === 'proposal' || r.state === 'deferred') args.push('--status', 'deferred')
      if (r.acceptance !== undefined) args.push('--acceptance', r.acceptance)
      const out = JSON.parse(bd(args))
      ids.set(r.key, (Array.isArray(out) ? out[0] : out).id)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  console.log(`migrate-planning: ${ids.size} item(s) created.`)

  const bad = []
  for (const r of rows) {
    const shown = JSON.parse(bd(['show', ids.get(r.key), '--json']))
    const item = Array.isArray(shown) ? shown[0] : shown
    if (strip(item.description) !== strip(r.body)) bad.push(`${ids.get(r.key)} (${r.path})`)
  }
  if (bad.length > 0) {
    console.error(`migrate-planning: ${bad.length} item(s) did not come back whole, so nothing was deleted:`)
    for (const b of bad) console.error(`  ${b}`)
    return 1
  }
  console.log('migrate-planning: every item came back whole.')

  // Children before parents: bd will not close a parent with an open child.
  for (const r of [...rows].reverse()) {
    if (r.state === 'closed') bd(['close', ids.get(r.key), '--reason', r.reason || 'closed'])
  }
  console.log(`migrate-planning: ${rows.filter((r) => r.state === 'closed').length} item(s) closed.`)

  for (const dir of ['docs/PLANNING', 'docs/DEBTS']) rmSync(join(root, dir), { recursive: true, force: true })
  console.log('migrate-planning: docs/PLANNING and docs/DEBTS removed. Nothing was committed.')
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    console.error(`migrate-planning: stopped: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
