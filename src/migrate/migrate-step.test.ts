import { test } from 'node:test'
import assert from 'node:assert/strict'

import { migrationStep, planMarkdown, planningPreview, stepFailure, type MigrationFacts } from './migrate-step.ts'

const ready: MigrationFacts = {
  oldFormat: false,
  planningFolders: true,
  container: { kind: 'one', running: true, hasMigrator: true, hasTracker: true, items: 0 },
}

test('a project on the old format starts with its files', () => {
  assert.equal(migrationStep({ ...ready, oldFormat: true }).step, 'files')
})

test('the files come first even when a container is ready, so nothing runs out of order', () => {
  assert.equal(migrationStep({ ...ready, oldFormat: true, container: { ...ready.container, items: 5 } as MigrationFacts['container'] }).step, 'files')
})

test('each missing fact about the container leads to a rebuild, and says which', () => {
  const cases: Array<[MigrationFacts['container'], RegExp]> = [
    [{ kind: 'none' }, /no container/],
    [{ kind: 'one', running: false, hasMigrator: true, hasTracker: true, items: 0 }, /not running/],
    [{ kind: 'one', running: true, hasMigrator: false, hasTracker: true, items: 0 }, /migrate-planning/],
    [{ kind: 'one', running: true, hasMigrator: true, hasTracker: false, items: 0 }, /tracker/],
  ]
  for (const [container, why] of cases) {
    const s = migrationStep({ ...ready, container })
    assert.equal(s.step, 'rebuild', JSON.stringify(container))
    assert.ok(s.step === 'rebuild' && why.test(s.why), s.step === 'rebuild' ? s.why : '')
  }
})

test('several containers for the project are refused by name', () => {
  const s = migrationStep({ ...ready, container: { kind: 'many', names: ['a', 'b'] } })
  assert.equal(s.step, 'refuse')
  assert.ok(s.step === 'refuse' && s.why.includes('a') && s.why.includes('b'))
})

test('a ready container with the planning still on disk and an empty tracker moves the planning', () => {
  assert.equal(migrationStep(ready).step, 'planning')
})

test('a tracker that already holds items offers the planning again, carried on from where it stopped (FR-128)', () => {
  // Found on fahrenheit404: the run stopped after 18 of 28 items, and the
  // refusal that used to stand here kept the project stuck for good.
  const s = migrationStep({ ...ready, container: { ...ready.container, items: 18 } as MigrationFacts['container'] })
  assert.equal(s.step, 'planning')
  assert.ok(s.step === 'planning' && /18/.test(s.resuming ?? '') && /carries on/.test(s.resuming ?? ''))
  const fresh = migrationStep(ready)
  assert.ok(fresh.step === 'planning' && fresh.resuming === undefined)
})

test('a project with nothing left to move is done, whatever its container', () => {
  assert.equal(migrationStep({ ...ready, planningFolders: false }).step, 'done')
  assert.equal(migrationStep({ oldFormat: false, planningFolders: false, container: { kind: 'none' } }).step, 'done')
})

test('the plan is Markdown that names every operation and every mention, and how to undo', () => {
  const md = planMarkdown('/home/jv/p', {
    kind: 'plan',
    ops: [
      { kind: 'write', path: 'CLAUDE.md', content: 'x' },
      { kind: 'remove', path: '.code-server.stack.json' },
      { kind: 'remove-submodule', path: '.code-server' },
    ],
    report: { mentions: [{ path: 'README.md', line: 3, text: 'see .code-server' }], undo: 'git restore' },
  })
  for (const s of ['/home/jv/p', 'CLAUDE.md', '.code-server.stack.json', 'README.md:3', 'git restore', 'Nothing is committed']) {
    assert.ok(md.includes(s), s)
  }
})

test('a planning preview that will refuse offers no Apply, and says why first (debt 1r9)', () => {
  const refusing = 'migrate-planning: REFUSES: 30 line(s) outside the folders read from docs/PLANNING or docs/DEBTS.\n  a.js:1: x\n'
  const v = planningPreview(refusing)
  assert.equal(v.apply, false)
  assert.match(v.markdown, /^# Migrate from code-server: the planning\n\n\*\*The run would refuse/)
  const fine = 'migrate-planning: 28 item(s): 3 epic(s), 9 story(ies), 16 task(s), 0 debt(s); 2 closed.\n'
  assert.equal(planningPreview(fine).apply, true)
})

test('a failed step names its cause from the whole output, not the command line (debt ba8)', () => {
  // As fahrenheit404's plan failed on 2026-10-07: execFile's error, whose
  // message starts "Command failed: docker exec ...", and the notification
  // showed only that first line.
  const stderr = [
    'warning: no beads configuration found in /config/workspace/.beads; using default database name "beads"',
    'time="2026-10-07T22:44:46Z" level=warning msg="skipping incomplete database directory" path=/config/workspace/.beads/embeddeddolt/beads',
    'Error: failed to open database: embeddeddolt: init schema: embeddeddolt: creating database: Error 1105: cannot create database beads: incomplete database directory from an interrupted create already exists; remove the directory and try again',
    'migrate-planning: stopped: Command failed: bd list --all --limit 0 --json',
    'warning: beads.role not configured (GH#2950).',
    '  Fix: git config beads.role maintainer',
    '',
  ].join('\n')
  const error = Object.assign(new Error(`Command failed: docker exec -u abc 1d40c5ba364b migrate-planning --plan\n${stderr}`), { stderr, stdout: '' })
  const f = stepFailure(error)
  assert.equal(f.cause, 'migrate-planning: stopped: Command failed: bd list --all --limit 0 --json')
  assert.ok(f.lines.some((l) => l.includes('incomplete database directory')), 'every line reaches the channel')
  assert.ok(!f.lines.includes(''), 'without the empty ones')
})

test('without a line from migrate-planning, the cause is the last meaningful one', () => {
  const stderr = 'Error response from daemon: container 94d4 is not running\n'
  assert.equal(stepFailure(Object.assign(new Error('Command failed: docker exec x'), { stderr })).cause,
    'Error response from daemon: container 94d4 is not running')
  assert.equal(stepFailure(new Error('timeout')).cause, 'timeout')
})
