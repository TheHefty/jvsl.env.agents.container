import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * core/bin/migrate-planning.mjs: the migration that ships in the image (FR-125,
 * FR-126; story the-planning-moves-into-the-tracker). It is plain JavaScript so
 * it runs on whichever Node a project's stack installs, and it is driven here
 * as a program, against a stand-in bd that behaves as the real one was
 * measured to: `show --json` prints a list, and a parent with an open child
 * cannot be closed.
 */
const SCRIPT = new URL('../core/bin/migrate-planning.mjs', import.meta.url).pathname

interface Api {
  stateFrom(text: string | undefined): { state: string; reason: string; known: boolean }
}
const api = (await import(SCRIPT)) as Api

// --- the vocabulary, as measured on 2026-10-07 ------------------------------

test('finished words close the item, wherever they sit in the first clause', () => {
  for (const s of ['Done', 'Done — all three stories shipped', 'Complete', 'Built', 'Shipped 2026-09-10',
    'Implemented', 'Implementada', 'Accepted and shipped']) {
    assert.equal(api.stateFrom(s).state, 'closed', s)
  }
})

test('superseded words close the item as superseded', () => {
  for (const s of ['Superseded by the-username-column', 'Refiled', 'Migrated — every story below']) {
    const r = api.stateFrom(s)
    assert.equal(r.state, 'closed', s)
    assert.match(r.reason, /^superseded: /, s)
  }
})

test('Accepted is open work, Draft a proposal, On hold deferred', () => {
  assert.equal(api.stateFrom('Accepted').state, 'open')
  assert.equal(api.stateFrom('Aceita').state, 'open')
  assert.equal(api.stateFrom('Draft — grilled 2026-09-27').state, 'proposal')
  assert.equal(api.stateFrom('On hold').state, 'deferred')
})

test('text that maps to nothing is open, and flagged so the plan lists it', () => {
  const r = api.stateFrom('Every story but the last two below')
  assert.equal(r.state, 'open')
  assert.equal(r.known, false)
  assert.equal(api.stateFrom(undefined).known, false)
})

// --- the program, against a fake tracker ------------------------------------

const work = mkdtempSync(join(tmpdir(), 'migrate-planning-'))
const bin = join(work, 'bin')
mkdirSync(bin)
writeFileSync(join(bin, 'bd'), `#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const store = process.env.BD_FAKE_STORE
fs.mkdirSync(store, { recursive: true })
const db = path.join(store, 'db.json')
const items = fs.existsSync(db) ? JSON.parse(fs.readFileSync(db, 'utf8')) : []
const save = () => fs.writeFileSync(db, JSON.stringify(items))
const a = process.argv.slice(2)
const flag = (f) => { const i = a.indexOf(f); return i < 0 ? undefined : a[i + 1] }
if (a[0] === 'create') {
  const parent = flag('--parent')
  let body = fs.readFileSync(flag('--body-file'), 'utf8').replace(/\\n+$/, '')
  if (process.env.BD_FAKE_TRUNCATE && body.length > 3) body = body.slice(0, -2)
  const id = (parent ? parent + '.' : 'x-') + (items.filter((i) => i.parent === parent).length + 1)
  items.push({ id, parent, title: a[1], issue_type: flag('--type') || 'task', description: body,
    acceptance_criteria: flag('--acceptance'), labels: (flag('--labels') || '').split(',').filter(Boolean),
    status: flag('--status') || 'open', close_reason: undefined })
  save(); console.log(JSON.stringify({ id }))
} else if (a[0] === 'show') {
  console.log(JSON.stringify(items.filter((i) => i.id === a[1])))
} else if (a[0] === 'close') {
  const it = items.find((i) => i.id === a[1])
  if (items.some((c) => c.parent === it.id && c.status !== 'closed')) {
    console.error('cannot close ' + it.id + ': open child issue(s); close children first'); process.exit(1)
  }
  it.status = 'closed'; it.close_reason = flag('--reason'); save()
} else { console.error('fake bd: ' + a.join(' ')); process.exit(2) }
`)
chmodSync(join(bin, 'bd'), 0o755)

const put = (root: string, rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}

/** A project in the shapes the template produced, measured on three projects. */
function project(): string {
  const root = mkdtempSync(join(work, 'p-'))
  // Index at docs/PLANNING/README.md; one epic as OVERVIEW.md, one as only a folder.
  put(root, 'docs/PLANNING/README.md', '# Planning\n')
  put(root, 'docs/PLANNING/study/OVERVIEW.md', '# Epic: study\n\n| | |\n|---|---|\n| **Status** | Every story but one |\n')
  put(root, 'docs/PLANNING/study/done-story/OVERVIEW.md', '# Story\n\n| | |\n|---|---|\n| **Status** | Done — shipped |\n')
  put(root, 'docs/PLANNING/study/done-story/done-story.feature', 'Feature: done\n')
  put(root, 'docs/PLANNING/study/done-story/tasks/finished.md', '---\nstatus: Implemented\n---\n# Task\n')
  put(root, 'docs/PLANNING/study/done-story/tasks/silent.md', '# Task with no status\n')
  put(root, 'docs/PLANNING/study/done-story/tasks/left-open.md', '---\nstatus: Accepted\n---\n# Task\n')
  put(root, 'docs/PLANNING/study/refiled/OVERVIEW.md', '# Story\n\n| | |\n|---|---|\n| **Status** | Refiled |\n')
  put(root, 'docs/PLANNING/study/drafted/OVERVIEW.md', '# Story\n\n| | |\n|---|---|\n| **Status** | Draft |\n')
  put(root, 'docs/PLANNING/study/drafted/tasks/t.md', '---\nstatus: Draft\n---\n# Task\n')
  put(root, 'docs/PLANNING/study/drafted/tasks/odd.md', '---\nstatus: Blocked by legal\n---\n# Task\n')
  put(root, 'docs/PLANNING/bare-epic/held/OVERVIEW.md', '# Story\n\n| | |\n|---|---|\n| **Status** | On hold |\n')
  put(root, 'docs/DEBTS/a-hotfix/OVERVIEW.md', '# Debt\n\n| | |\n|---|---|\n| **Status** | Paid |\n| **Kind** | hotfix |\n')
  put(root, 'docs/DEBTS/free-text.md', '# Debt\n\n| | |\n|---|---|\n| **Status** | Open |\n| **Kind** | bug (found in production) |\n')
  return root
}

function migrate(root: string, ...args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync('node', [SCRIPT, ...args], {
      cwd: root, encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, PATH: `${bin}:${process.env['PATH']}`, BD_FAKE_STORE: join(root, '.fake-bd') },
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: err.stdout + err.stderr }
  }
}

interface Item { id: string; parent?: string; title: string; issue_type: string; status: string; labels: string[]; close_reason?: string; acceptance_criteria?: string }
const items = (root: string): Item[] => JSON.parse(readFileSync(join(root, '.fake-bd/db.json'), 'utf8')) as Item[]
const byTitle = (root: string, t: string) => items(root).find((i) => i.title === t)

test('--plan writes nothing and lists what it could not read a state for', () => {
  const root = project()
  const r = migrate(root, '--plan')
  assert.equal(r.code, 0, r.out)
  assert.ok(!existsSync(join(root, '.fake-bd')), 'no item created')
  assert.ok(existsSync(join(root, 'docs/PLANNING')) && existsSync(join(root, 'docs/DEBTS')))
  // An epic's own text is not a state (it closes with its stories), so only a
  // story or task whose state could not be read is listed.
  assert.match(r.out, /task study\/drafted\/odd: state not recognised \(Blocked by legal\), left open/)
  assert.doesNotMatch(r.out, /Every story but one/)
})

test('every layout is read, every item is under its parent, and states follow the documents', () => {
  const root = project()
  const r = migrate(root)
  assert.equal(r.code, 0, r.out)
  const it = (t: string) => byTitle(root, t)!
  assert.equal(it('bare-epic').issue_type, 'epic', 'an epic that is only a folder is still an epic')
  assert.equal(it('done-story').parent, it('study').id)
  assert.equal(it('finished').parent, it('done-story').id)
  assert.equal(it('done-story').status, 'closed')
  assert.equal(it('done-story').acceptance_criteria, 'Feature: done\n')
  assert.equal(it('finished').status, 'closed')
  assert.equal(it('silent').status, 'closed', 'a task with no status follows its story')
  assert.equal(it('refiled').status, 'closed')
  assert.match(it('refiled').close_reason ?? '', /^superseded: /)
  assert.ok(it('drafted').labels.includes('proposed') && it('drafted').status === 'deferred')
  assert.equal(it('held').status, 'deferred')
})

test('a finished story closes its unfinished task with it, and the run lists it', () => {
  const root = project()
  const r = migrate(root)
  const t = byTitle(root, 'left-open')!
  assert.equal(t.status, 'closed')
  assert.match(t.close_reason ?? '', /^closed with its story: Done — shipped; the task recorded Accepted/)
  assert.match(r.out, /left-open/)
})

test('an epic closes only when every story under it is closed', () => {
  const root = project()
  migrate(root)
  assert.notEqual(byTitle(root, 'study')!.status, 'closed', 'drafted is a proposal, not closed')
  const solo = project()
  put(solo, 'docs/PLANNING/bare-epic/held/OVERVIEW.md', '# Story\n\n| | |\n|---|---|\n| **Status** | Shipped |\n')
  migrate(solo)
  assert.equal(byTitle(solo, 'bare-epic')!.status, 'closed')
})

test('debts take their kind from the Kind row, and their state from the Status row', () => {
  const root = project()
  migrate(root)
  const hot = byTitle(root, 'a-hotfix')!; const free = byTitle(root, 'free-text')!
  assert.deepEqual([hot.issue_type, hot.labels, hot.status], ['bug', ['hotfix'], 'closed'])
  assert.deepEqual([free.issue_type, free.labels, free.status], ['bug', ['defect'], 'open'])
})

test('the folders go entirely when everything came back whole, and nothing is committed', () => {
  const root = project()
  execFileSync('git', ['init', '-q'], { cwd: root })
  const r = migrate(root)
  assert.equal(r.code, 0, r.out)
  assert.ok(!existsSync(join(root, 'docs/PLANNING')) && !existsSync(join(root, 'docs/DEBTS')))
  assert.equal(execFileSync('git', ['-C', root, 'rev-list', '--all', '--count'], { encoding: 'utf8' }).trim(), '0', 'no commit')
})

test('a body that does not come back whole stops the run, names the item, and deletes nothing', () => {
  const root = project()
  process.env['BD_FAKE_TRUNCATE'] = '1'
  const r = migrate(root)
  delete process.env['BD_FAKE_TRUNCATE']
  assert.notEqual(r.code, 0)
  assert.match(r.out, /did not come back whole/)
  assert.ok(existsSync(join(root, 'docs/PLANNING/study/done-story/OVERVIEW.md')))
  assert.ok(readdirSync(join(root, 'docs/DEBTS')).length > 0)
})

test('a project with no planning has nothing to migrate', () => {
  const root = mkdtempSync(join(work, 'empty-'))
  const r = migrate(root)
  assert.equal(r.code, 0)
  assert.match(r.out, /nothing to migrate/)
})
