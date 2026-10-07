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
// **The order is the safety property**: plan, place what the tracker already
// holds, create what is missing, read every item back, close children before
// parents, and only then delete the folders. Nothing is committed.
//
// **A run that stops part-way is carried on, never repeated** (FR-128). Every
// item records its document as its external reference, so a second run
// creates only what is missing; fahrenheit404's first run stopped after 18 of
// 28 items, and a rerun of the earlier script would have duplicated them.
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
    const erow = { key: epic, ref: `planning:docs/PLANNING/${epic}`, kind: 'epic', type: 'epic', parent: null, title: epic, path: edoc,
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
      const srow = { key: `${epic}/${story}`, ref: `planning:docs/PLANNING/${epic}/${story}`, kind: 'story', type: 'feature', parent: epic, title: story,
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
        rows.push({ key: `${epic}/${story}/${name}`, ref: `planning:docs/PLANNING/${epic}/${story}/${name}`, kind: 'task', type: 'task', parent: `${epic}/${story}`, title: name,
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
    rows.push({ key: `debt:${entry}`, ref: `planning:docs/DEBTS/${entry}`, kind: 'debt', type: 'bug', parent: null, title: entry.replace(/\.md$/, ''),
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

const one = (out) => { const v = JSON.parse(out); return Array.isArray(v) ? v[0] : v }

/**
 * Places every item the tracker already holds on a row of the plan (FR-128).
 * A marked item is the row its mark names. An unmarked one, as the earlier
 * script left them, is recognised by type, title and the same of its parents,
 * and only when exactly one row looks like it. Anything else is not guessed
 * at: it is returned as unplaced, and the run refuses before writing.
 */
export function place(rows, existing) {
  const byRef = new Map(rows.map((r) => [r.ref, r]))
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const rowSig = (r) => (r.parent ? rowSig(byKey.get(r.parent)) + '/' : '') + `${r.type}:${r.title}`
  const sigRows = new Map()
  for (const r of rows) sigRows.set(rowSig(r), [...(sigRows.get(rowSig(r)) ?? []), r])
  const byId = new Map(existing.map((i) => [i.id, i]))
  const itemSig = (i, seen = 0) => {
    const parent = i.parent ? byId.get(i.parent) : undefined
    if (i.parent && (!parent || seen > 32)) return `?${i.parent}/${i.issue_type}:${i.title}`
    return (parent ? itemSig(parent, seen + 1) + '/' : '') + `${i.issue_type}:${i.title}`
  }
  const claims = new Map()
  const unplaced = []
  const recognised = []
  for (const i of existing) {
    const name = `${i.id} (${i.issue_type} ${i.title})`
    let row
    if (i.external_ref) {
      row = byRef.get(i.external_ref)
      if (!row) { unplaced.push(`${name}: its mark ${i.external_ref} names no document here`); continue }
    } else {
      const matches = sigRows.get(itemSig(i)) ?? []
      if (matches.length !== 1) { unplaced.push(`${name}: no mark, and no single document it could have come from`); continue }
      row = matches[0]
      recognised.push({ id: i.id, row })
    }
    claims.set(row.key, [...(claims.get(row.key) ?? []), i])
  }
  const placed = new Map()
  for (const [key, items] of claims) {
    if (items.length === 1) { placed.set(key, items[0]); continue }
    for (const i of items) unplaced.push(`${i.id} (${i.issue_type} ${i.title}): one of ${items.length} items that all look like ${byKey.get(key).ref}`)
  }
  return { placed, unplaced, recognised: recognised.filter((r) => placed.get(r.row.key)?.id === r.id) }
}

export function main(argv, root = process.cwd()) {
  const { rows, listed } = plan(root)
  if (rows.length === 0) {
    console.log('migrate-planning: nothing to migrate: no docs/PLANNING or docs/DEBTS here.')
    return 0
  }
  say(rows, listed)
  const dry = argv.includes('--plan')

  // --limit 0: bd lists 50 items unless told otherwise (measured, bd 1.3.1),
  // and an item it did not list would be created a second time.
  const existing = JSON.parse(bd(['list', '--all', '--limit', '0', '--json']) || '[]')
  const { placed, unplaced, recognised } = place(rows, existing)
  if (unplaced.length > 0) {
    const say = dry ? console.log : console.error
    say(`\nmigrate-planning: the tracker holds ${unplaced.length} item(s) the folders do not describe, so ${dry ? 'the run will refuse' : 'nothing was written'}:`)
    for (const u of unplaced) say(`  ${u}`)
    say('Close or move them, or migrate by hand.')
    return dry ? 0 : 1
  }
  if (existing.length > 0) {
    console.log(`migrate-planning: ${existing.length} already in the tracker from an earlier run; ${rows.length - placed.size} to create.`)
  }
  if (dry) return 0

  if (recognised.length > 0) {
    console.log(`migrate-planning: recognised ${recognised.length} item(s) an earlier run left without a mark, and marked them:`)
    for (const r of recognised) {
      bd(['update', r.id, '--external-ref', r.row.ref])
      console.log(`  ${r.id} as ${r.row.ref}`)
    }
  }

  const ids = new Map([...placed].map(([key, item]) => [key, item.id]))
  const tmp = mkdtempSync(join(tmpdir(), 'migrate-planning-'))
  let created = 0
  try {
    for (const r of rows) {
      if (ids.has(r.key)) continue
      const bodyFile = join(tmp, 'body')
      writeFileSync(bodyFile, r.body)
      const args = ['create', r.title, '--type', r.type, '--body-file', bodyFile, '--external-ref', r.ref, '--json']
      if (r.parent) args.push('--parent', ids.get(r.parent))
      if (r.labels.length > 0) args.push('--labels', r.labels.join(','))
      if (r.state === 'proposal' || r.state === 'deferred') args.push('--status', 'deferred')
      if (r.acceptance !== undefined) args.push('--acceptance', r.acceptance)
      ids.set(r.key, one(bd(args)).id)
      created++
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  console.log(`migrate-planning: ${created} item(s) created.`)

  const bad = []
  const status = new Map()
  for (const r of rows) {
    const item = one(bd(['show', ids.get(r.key), '--json']))
    status.set(r.key, item.status)
    if (strip(item.description) !== strip(r.body)) bad.push(`${ids.get(r.key)} (${r.path})`)
  }
  if (bad.length > 0) {
    console.error(`migrate-planning: ${bad.length} item(s) did not come back whole, so nothing was deleted:`)
    for (const b of bad) console.error(`  ${b}`)
    return 1
  }
  console.log('migrate-planning: every item came back whole.')

  // Children before parents: bd will not close a parent with an open child.
  // An item an earlier run already closed is left as it is.
  let closed = 0
  for (const r of [...rows].reverse()) {
    if (r.state !== 'closed' || status.get(r.key) === 'closed') continue
    bd(['close', ids.get(r.key), '--reason', r.reason || 'closed'])
    closed++
  }
  console.log(`migrate-planning: ${closed} item(s) closed.`)

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
