import { test } from 'node:test'
import assert from 'node:assert/strict'

import { viewItems, type ViewState } from './view.ts'

/**
 * What the sidebar shows, as a function of what is on disk.
 *
 * The tree provider is a shell over this for the same reason the questions are:
 * a test that asserts a `TreeItem` was constructed is a test of the constructor.
 * What can be wrong here is which rows appear and what they say.
 */

const configured: ViewState = {
  stacksAvailable: ['java', 'node', 'rust'],
  manifest: { java: '21', rust: '1.83', limits: { memory: '6g', cpus: 4 } },
}

test('each selected stack is a row with its version', () => {
  const rows = viewItems(configured)
  assert.deepEqual(
    rows.filter((r) => r.kind === 'stack'),
    [
      { kind: 'stack', label: 'java', detail: '21' },
      { kind: 'stack', label: 'rust', detail: '1.83' },
    ],
  )
})

test('a stack the template has and the project did not select is not a row', () => {
  // The view says what is selected, not what exists. The picker is where the
  // available list belongs, and showing both here would make "selected" the
  // thing a reader has to infer.
  const rows = viewItems(configured)
  assert.ok(!rows.some((r) => r.label === 'node'), JSON.stringify(rows))
})

test('the limits are rows, and an absent one is not invented', () => {
  const rows = viewItems(configured).filter((r) => r.kind === 'limit')
  assert.deepEqual(rows, [
    { kind: 'limit', label: 'memory', detail: '6g' },
    { kind: 'limit', label: 'cpus', detail: '4' },
  ])
})

test('a project with no manifest says so, and says what to do', () => {
  const rows = viewItems({ stacksAvailable: ['java'], manifest: null })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.kind, 'empty')
  assert.match(rows[0]?.detail ?? '', /configure/i)
})

test('a manifest selecting nothing is not the same as no manifest', () => {
  // Zero stacks is a real selection — it produces the core image — and reporting
  // it as "not configured" would send somebody to answer questions they have
  // already answered.
  const rows = viewItems({ stacksAvailable: ['java'], manifest: { limits: { memory: '6g' } } })
  assert.ok(!rows.some((r) => r.kind === 'empty'), JSON.stringify(rows))
  assert.ok(rows.some((r) => r.kind === 'limit'), JSON.stringify(rows))
  assert.ok(rows.some((r) => r.kind === 'note' && /core/i.test(r.detail)), JSON.stringify(rows))
})

test('no stacks available is its own row, not an empty list', () => {
  // **The structural claim survives and the message reversed.** This asserted
  // that the detail named `submodule update --init`, which was right while the
  // stacks came from a submodule: an empty `.code-server/` read as a broken
  // extension rather than a missing checkout. The extension carries the stacks
  // now, so an empty list *is* a broken installation and the row says so.
  //
  // What has not changed is that it must be a row of its own. An empty list and
  // "there is nothing to list" send somebody to different places.
  const rows = viewItems({ stacksAvailable: [], manifest: null })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.kind, 'uninitialised')
  assert.match(rows[0]?.detail ?? '', /reinstall/)
})

test('a manifest key the extension does not own is not shown as a limit or a stack', () => {
  // It survives on disk — that is the questions' job — but inventing a row for
  // every unknown key would make the view a JSON viewer with worse formatting.
  const rows = viewItems({
    stacksAvailable: ['java'],
    manifest: { java: '21', teamNotes: 'kept', publishCodeServerPort: true },
  })
  assert.ok(!rows.some((r) => /teamNotes|publish/.test(r.label)), JSON.stringify(rows))
})

test('a failed build leaves a row, and a cancelled one says cancelled', () => {
  // FR-66's surface. The two have to read differently or stopping a build looks
  // like breaking one — and there is no notification, so this row is the only
  // place either is said.
  const failed = viewItems({ ...configured, lastBuild: 'failed' })
  assert.deepEqual(failed.at(-1), { kind: 'build', label: 'last build', detail: 'failed' })

  const cancelled = viewItems({ ...configured, lastBuild: 'cancelled' })
  assert.equal(cancelled.at(-1)?.detail, 'cancelled')
})

test('no build in this session leaves no row', () => {
  // Rather than "last build: never", which is a row that is always there and
  // says nothing on the first open.
  assert.ok(!viewItems(configured).some((r) => r.kind === 'build'), 'a build row appeared')
})

test('with no folder, the rows are the two entries and each names a contributed command', () => {
  // **The panel.** `getChildren` returned [] with no folder, so the view was
  // invisible exactly when somebody has nothing open and most needs a way in.
  const rows = viewItems({ stacksAvailable: ['java'], manifest: null, folderOpen: false })
  assert.deepEqual(rows.map((r) => r.kind), ['entry', 'entry'])
  // Derived from the commands rather than written beside them, so the next
  // command removed does not leave a row behind offering it.
  for (const row of rows) {
    assert.match(row.command ?? '', /^jvsl\.agentContainer\./)
  }
})

test('a host problem is the first row, before either entry', () => {
  // The panel is the first thing anybody sees, so a host with no usable docker
  // says so there — not three clicks later, inside a build, as a message about
  // something else.
  const rows = viewItems({
    stacksAvailable: ['java'],
    manifest: null,
    folderOpen: false,
    hostProblem: 'docker is not on PATH',
  })
  assert.equal(rows[0]?.kind, 'problem')
  assert.match(rows[0]?.detail ?? '', /docker/)
  assert.ok(rows.slice(1).every((r) => r.kind === 'entry'), JSON.stringify(rows))
})

test('the no-stacks row names a reinstall, not a submodule', () => {
  // **Two places described this condition and disagreed.** The command says the
  // installation is incomplete and to reinstall; this said "run git submodule
  // update --init", for a submodule this repository removed. The guard did not
  // catch it because it looks for `.code-server/` paths and this is prose.
  const rows = viewItems({ stacksAvailable: [], manifest: null, folderOpen: true })
  const text = rows.map((r) => `${r.label} ${r.detail}`).join(' ')
  assert.doesNotMatch(text, /submodule|checked out/i)
  assert.match(text, /reinstall|incomplete/i)
})

test('a project with a tracker offers to show the work', () => {
  // FR-118: the board opens from where the project already is. Only a project
  // that asked for a tracker has one to show.
  const withTracker = viewItems({ stacksAvailable: ['java'], manifest: { java: '21', beads: true } })
  const entry = withTracker.find((r) => r.kind === 'entry')
  assert.ok(entry, JSON.stringify(withTracker))
  assert.equal(entry.command, 'jvsl.agentContainer.showWork')
  const without = viewItems({ stacksAvailable: ['java'], manifest: { java: '21' } })
  assert.equal(without.find((r) => r.command === 'jvsl.agentContainer.showWork'), undefined)
})
