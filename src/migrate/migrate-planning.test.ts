import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
const SCRIPT = new URL('../../core/bin/migrate-planning.mjs', import.meta.url).pathname

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
const db = path.join(store, 'db.json')
const items = fs.existsSync(db) ? JSON.parse(fs.readFileSync(db, 'utf8')) : []
const save = () => { fs.mkdirSync(store, { recursive: true }); fs.writeFileSync(db, JSON.stringify(items)) }
const a = process.argv.slice(2)
const flag = (f) => { const i = a.indexOf(f); return i < 0 ? undefined : a[i + 1] }
if (a[0] === 'create') {
  // BD_FAKE_FAIL_AT=N: the Nth create of this run fails, as the real run on
  // fahrenheit404 stopped part-way. BD_FAKE_NO_REF: the earlier script, which
  // left no mark.
  const counter = path.join(store, 'creates')
  fs.mkdirSync(store, { recursive: true })
  const n = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0) + 1
  fs.writeFileSync(counter, String(n))
  if (process.env.BD_FAKE_FAIL_AT && n === Number(process.env.BD_FAKE_FAIL_AT)) { console.error('fake bd: create failed'); process.exit(1) }
  const parent = flag('--parent')
  let body = fs.readFileSync(flag('--body-file'), 'utf8').replace(/\\n+$/, '')
  if (process.env.BD_FAKE_TRUNCATE && body.length > 3) body = body.slice(0, -2)
  const id = (parent ? parent + '.' : 'x-') + (items.filter((i) => i.parent === parent).length + 1)
  items.push({ id, parent, title: a[1], issue_type: flag('--type') || 'task', description: body,
    acceptance_criteria: flag('--acceptance'), labels: (flag('--labels') || '').split(',').filter(Boolean),
    external_ref: process.env.BD_FAKE_NO_REF ? null : (flag('--external-ref') ?? null),
    status: flag('--status') || 'open', close_reason: undefined })
  save(); console.log(JSON.stringify({ id }))
} else if (a[0] === 'list') {
  // Measured on bd 1.3.1: --limit defaults to 50, and 0 means all of them.
  const limit = flag('--limit') === undefined ? 50 : Number(flag('--limit'))
  const shown = a.includes('--all') ? items : items.filter((i) => i.status !== 'closed')
  console.log(JSON.stringify(limit === 0 ? shown : shown.slice(0, limit)))
} else if (a[0] === 'update') {
  const it = items.find((i) => i.id === a[1])
  if (flag('--external-ref') !== undefined) it.external_ref = flag('--external-ref')
  save()
} else if (a[0] === 'show') {
  console.log(JSON.stringify(items.filter((i) => i.id === a[1])))
} else if (a[0] === 'close') {
  const it = items.find((i) => i.id === a[1])
  if (it.status === 'closed') { console.error('cannot close ' + it.id + ': already closed'); process.exit(1) }
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

/** What bd init writes, measured on this repository's own tracker. */
const META = JSON.stringify({ database: 'dolt', backend: 'dolt', dolt_mode: 'embedded', dolt_database: 'a_project' })

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
  execFileSync('git', ['init', '-q'], { cwd: root })
  put(root, '.beads/metadata.json', META)
  return root
}

function migrate(root: string, ...args: string[]): { code: number; out: string } {
  return migrateWith({}, root, ...args)
}

function migrateWith(env: Record<string, string>, root: string, ...args: string[]): { code: number; out: string } {
  rmSync(join(root, '.fake-bd/creates'), { force: true })
  try {
    const out = execFileSync('node', [SCRIPT, ...args], {
      cwd: root, encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, ...env, PATH: `${bin}:${process.env['PATH']}`, BD_FAKE_STORE: join(root, '.fake-bd') },
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: err.stdout + err.stderr }
  }
}

interface Item { id: string; parent?: string; external_ref?: string | null; title: string; issue_type: string; status: string; labels: string[]; close_reason?: string; acceptance_criteria?: string }
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

test('the debts folder\'s README is its index, never a debt (found in gosnip PR #10)', () => {
  const root = project()
  put(root, 'docs/DEBTS/README.md', '# Debts\n\nAn index of the debts below.\n')
  migrate(root)
  assert.equal(byTitle(root, 'README'), undefined)
})

test('a project with no planning has nothing to migrate', () => {
  const root = mkdtempSync(join(work, 'empty-'))
  const r = migrate(root)
  assert.equal(r.code, 0)
  assert.match(r.out, /nothing to migrate/)
})

// --- carrying on a run that stopped (FR-128; task the-planning-migration-carries-on)

const keyed = (root: string) => items(root).map((i) => `${i.issue_type} ${i.title}`).sort()

test('every item carries the document it came from as its external reference', () => {
  const root = project()
  migrate(root)
  assert.equal(byTitle(root, 'done-story')!.external_ref, 'planning:docs/PLANNING/study/done-story')
  assert.equal(byTitle(root, 'finished')!.external_ref, 'planning:docs/PLANNING/study/done-story/finished')
  assert.equal(byTitle(root, 'bare-epic')!.external_ref, 'planning:docs/PLANNING/bare-epic')
  assert.equal(byTitle(root, 'free-text')!.external_ref, 'planning:docs/DEBTS/free-text.md')
})

test('a run that stopped part-way is carried on, and every item exists once', () => {
  const whole = project(); migrate(whole)
  const root = project()
  const first = migrateWith({ BD_FAKE_FAIL_AT: '7' }, root)
  assert.notEqual(first.code, 0, 'the first run stops')
  assert.equal(items(root).length, 6)
  assert.ok(existsSync(join(root, 'docs/PLANNING')), 'nothing deleted after a stop')
  const second = migrate(root)
  assert.equal(second.code, 0, second.out)
  assert.deepEqual(keyed(root), keyed(whole), 'the same items as one whole run, none twice')
  assert.equal(byTitle(root, 'finished')!.parent, byTitle(root, 'done-story')!.id)
  assert.ok(!existsSync(join(root, 'docs/PLANNING')) && !existsSync(join(root, 'docs/DEBTS')))
})

test('closing is carried on too: what is closed stays closed, the rest closes', () => {
  const shipped = (root: string) => put(root, 'docs/PLANNING/bare-epic/held/OVERVIEW.md', '# Story\n\n| | |\n|---|---|\n| **Status** | Shipped |\n')
  const root = project(); shipped(root)
  migrate(root)
  // A run that stopped between closes: these two still open, the folders still here.
  const reopened = items(root).map((i) => i.title === 'bare-epic' || i.title === 'held' ? { ...i, status: 'open' } : i)
  writeFileSync(join(root, '.fake-bd/db.json'), JSON.stringify(reopened))
  const again = project(); shipped(again)
  execFileSync('cp', ['-r', join(again, 'docs'), root])
  const r = migrate(root)
  assert.equal(r.code, 0, r.out)
  assert.equal(byTitle(root, 'held')!.status, 'closed')
  assert.equal(byTitle(root, 'bare-epic')!.status, 'closed')
  assert.equal(byTitle(root, 'finished')!.status, 'closed', 'already closed, and closing it again would have failed')
  assert.match(r.out, /2 item\(s\) closed/)
})

test('items the earlier script left without a mark are recognised, marked and listed', () => {
  const whole = project(); migrate(whole)
  const root = project()
  migrateWith({ BD_FAKE_FAIL_AT: '7', BD_FAKE_NO_REF: '1' }, root)
  const r = migrate(root)
  assert.equal(r.code, 0, r.out)
  assert.deepEqual(keyed(root), keyed(whole))
  assert.ok(items(root).every((i) => i.external_ref?.startsWith('planning:')), 'every item marked')
  assert.match(r.out, /recognised 6 item\(s\)/)
  assert.match(r.out, /done-story/)
})

test('an item the plan cannot place stops the run before anything is written, and is named', () => {
  const root = project()
  migrateWith({ BD_FAKE_FAIL_AT: '7', BD_FAKE_NO_REF: '1' }, root)
  const db = items(root)
  db.push({ id: 'x-99', title: 'somebody-elses-work', issue_type: 'task', status: 'open', labels: [], external_ref: null })
  writeFileSync(join(root, '.fake-bd/db.json'), JSON.stringify(db))
  const before = readFileSync(join(root, '.fake-bd/db.json'), 'utf8')
  const r = migrate(root)
  assert.notEqual(r.code, 0)
  assert.match(r.out, /x-99 \(task somebody-elses-work\)/)
  assert.match(r.out, /the folders do not describe/)
  assert.equal(readFileSync(join(root, '.fake-bd/db.json'), 'utf8'), before, 'nothing created, marked or closed')
  assert.ok(existsSync(join(root, 'docs/PLANNING')))
})

test('two items that both look like one row are not guessed between', () => {
  const root = project()
  migrateWith({ BD_FAKE_FAIL_AT: '2', BD_FAKE_NO_REF: '1' }, root)
  const db = items(root)
  db.push({ ...db[0]!, id: 'x-98' })
  writeFileSync(join(root, '.fake-bd/db.json'), JSON.stringify(db))
  const r = migrate(root)
  assert.notEqual(r.code, 0)
  assert.match(r.out, /x-98/)
  assert.equal(items(root).length, 2)
})

test('more than fifty items already in the tracker are all seen, not created again', () => {
  const root = mkdtempSync(join(work, 'many-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  put(root, '.beads/metadata.json', META)
  for (let i = 0; i < 60; i++) put(root, `docs/DEBTS/d${String(i).padStart(2, '0')}.md`, '# Debt\n\n| | |\n|---|---|\n| **Status** | Open |\n')
  migrateWith({ BD_FAKE_FAIL_AT: '56' }, root)
  assert.equal(items(root).length, 55)
  const r = migrate(root)
  assert.equal(r.code, 0, r.out)
  assert.equal(items(root).length, 60)
})

test('the plan says what is already in the tracker, and writes nothing', () => {
  const root = project()
  migrateWith({ BD_FAKE_FAIL_AT: '7' }, root)
  const before = readFileSync(join(root, '.fake-bd/db.json'), 'utf8')
  const r = migrate(root, '--plan')
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /6 already in the tracker/)
  assert.equal(readFileSync(join(root, '.fake-bd/db.json'), 'utf8'), before)
})

// --- what other tools read from the folders (debt the-migration-deletes-files-another-tool-reads)

test('a configuration that reads a .feature from the folders stops the run before anything is written', () => {
  // fahrenheit404's playwright.config.ts, as measured on 2026-10-08.
  const root = project()
  put(root, 'web/playwright.config.ts', "export default {\n  features: [\n    '../docs/PLANNING/study/done-story/done-story.feature',\n  ],\n}\n")
  const r = migrate(root)
  assert.notEqual(r.code, 0)
  assert.match(r.out, /web\/playwright\.config\.ts:3/)
  assert.match(r.out, /read from docs\/PLANNING or docs\/DEBTS/)
  assert.ok(!existsSync(join(root, '.fake-bd/db.json')), 'nothing created')
  assert.ok(existsSync(join(root, 'docs/PLANNING/study/done-story/done-story.feature')))
})

test('a glob or the folder itself counts as reading it, as kotodori does in four places', () => {
  const root = project()
  put(root, 'app/wdio.conf.js', "  specs: ['./docs/SCENARIOS/**/*.feature', '../../../docs/PLANNING/**/*.feature'],\n")
  put(root, 'build/conventions.gradle.kts', '    from(rootDir.resolve("../../docs/PLANNING")) {\n')
  put(root, 'scripts/guard', "for ov in $(git ls-files -- 'docs/PLANNING/*/*/OVERVIEW.md'); do :; done\n")
  const r = migrate(root)
  assert.notEqual(r.code, 0)
  for (const f of ['app/wdio.conf.js:1', 'build/conventions.gradle.kts:1', 'scripts/guard:1']) assert.match(r.out, new RegExp(f.replace(/[./]/g, '\\$&')))
})

test('a citation in a comment or in Markdown is listed, and does not stop the run', () => {
  const root = project()
  put(root, 'src/SecondFactor.tsx', '  /* docs/DEBTS/a-pending-enrolment-cannot-be-restarted. */\n')
  put(root, 'README.md', 'Planning lives in [docs/PLANNING](docs/PLANNING/README.md).\n')
  const r = migrate(root)
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /src\/SecondFactor\.tsx:1/)
  assert.match(r.out, /README\.md:1/)
  assert.ok(!existsSync(join(root, 'docs/PLANNING')))
})

test('a file not yet committed counts too: the operator may have just moved the features', () => {
  const root = project()
  put(root, 'web/playwright.config.ts', "featuresRoot: '../docs/PLANNING',\n")
  const r = migrate(root)
  assert.notEqual(r.code, 0)
  assert.match(r.out, /web\/playwright\.config\.ts:1/)
})

test('the plan lists what reads the folders and says the run will refuse, and exits clean', () => {
  const root = project()
  put(root, 'web/playwright.config.ts', "featuresRoot: '../docs/PLANNING',\n")
  const r = migrate(root, '--plan')
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /web\/playwright\.config\.ts:1/)
  assert.match(r.out, /the run will refuse/)
})

test('a workspace that is not a git repository is refused, since what reads the folders cannot be listed', () => {
  const root = project()
  rmSync(join(root, '.git'), { recursive: true, force: true })
  const r = migrate(root)
  assert.notEqual(r.code, 0)
  assert.match(r.out, /not a git repository/)
  assert.ok(existsSync(join(root, 'docs/PLANNING')))
})

// --- the tracker's configuration (debt bd-without-metadata-uses-an-empty-database)

test('a tracker without its metadata.json is refused before bd is asked anything', () => {
  // Measured with bd 1.3.1 on 2026-10-08: without .beads/metadata.json, bd
  // lists 0 items where there were 95, and creates a database named "beads"
  // beside the real one. Every item would be created there, in the wrong one.
  const root = project()
  rmSync(join(root, '.beads/metadata.json'))
  const r = migrate(root)
  assert.notEqual(r.code, 0)
  assert.match(r.out, /\.beads\/metadata\.json is missing/)
  assert.match(r.out, /git checkout -- \.beads\/metadata\.json/)
  assert.ok(!existsSync(join(root, '.fake-bd')), 'bd was never run, so it created nothing anywhere')
  assert.ok(existsSync(join(root, 'docs/PLANNING')))
})

test('a metadata.json that names no database is refused the same way', () => {
  const root = project()
  put(root, '.beads/metadata.json', '{"backend":"dolt"}')
  const r = migrate(root)
  assert.notEqual(r.code, 0)
  assert.match(r.out, /names no dolt_database/)
  assert.ok(!existsSync(join(root, '.fake-bd')))
})

test('the plan refuses too, so the preview never shows an empty tracker as the truth', () => {
  const root = project()
  rmSync(join(root, '.beads/metadata.json'))
  const r = migrate(root, '--plan')
  assert.notEqual(r.code, 0)
  assert.match(r.out, /\.beads\/metadata\.json is missing/)
})

// --- a refusal is read first (debt a-refusal-is-gone-before-it-can-be-read)

test('a plan that will refuse says so on its first line, before the notes and citations', () => {
  // kotodori's plan put its refusal after 18 notes and 108 citations.
  const root = project()
  put(root, 'web/playwright.config.ts', "featuresRoot: '../docs/PLANNING',\n")
  put(root, 'src/cites.ts', '// docs/DEBTS/a-debt-cited-in-a-comment\n')
  const r = migrate(root, '--plan')
  assert.equal(r.code, 0, r.out)
  const first = r.out.split('\n').find((l) => l.trim() !== '')
  assert.match(first ?? '', /^migrate-planning: REFUSES:/)
  assert.ok(r.out.indexOf('web/playwright.config.ts:1') < r.out.indexOf('src/cites.ts:1'), 'what refuses comes before what is only cited')
})

test('a plan for an item the tracker cannot place says so first too', () => {
  const root = project()
  migrateWith({ BD_FAKE_FAIL_AT: '7', BD_FAKE_NO_REF: '1' }, root)
  const db = items(root)
  db.push({ id: 'x-99', title: 'somebody-elses-work', issue_type: 'task', status: 'open', labels: [], external_ref: null })
  writeFileSync(join(root, '.fake-bd/db.json'), JSON.stringify(db))
  const r = migrate(root, '--plan')
  assert.match(r.out.split('\n').find((l) => l.trim() !== '') ?? '', /^migrate-planning: REFUSES:/)
})
