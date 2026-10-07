import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CSP, boardPage, messagePage } from './board-page.ts'
import type { Item } from './board-read.ts'

const NONCE = 'n0nceN0nceN0nce0'

const item = (o: Partial<Item>): Item => ({
  id: 'p-1', title: 'title', status: 'open', type: 'task', labels: [], blockedBy: [], ...o,
})

test('the policy allows nothing but the page itself', () => {
  // FR-118 and the story's safety scenario: content somebody wrote is rendered
  // here, so nothing may run without the page's nonce, and nothing may load.
  assert.equal(
    CSP(NONCE),
    `default-src 'none'; script-src 'nonce-${NONCE}'; style-src 'nonce-${NONCE}'; img-src 'none'; ` +
      `font-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`,
  )
})

test('the page carries the policy, and the nonce only on its own script and style', () => {
  const html = boardPage({ nonce: NONCE, items: [item({})], rendered: new Map() })
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${CSP(NONCE)}">`))
  assert.equal(html.split(`nonce="${NONCE}"`).length - 1, 2, 'one script and one style tag, nothing else')
})

test('what an item says cannot gain the nonce or a place outside its container', () => {
  const hostile = '<script>alert(1)</script><img src="https://example.invalid/x.png" onerror="alert(2)">'
  const rendered = new Map([['p-1', { description: hostile }]])
  const html = boardPage({
    nonce: NONCE,
    items: [item({ title: '<script>t()</script>', description: hostile })],
    rendered,
  })
  // The title is text, escaped.
  assert.ok(!html.includes('<script>t()</script>'))
  assert.ok(html.includes('&lt;script&gt;t()&lt;/script&gt;'))
  // The rendered body is HTML by design, so it is the policy that disarms it:
  // every script in the page that carries the nonce is the page's own.
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
  assert.equal(scripts.filter((s) => s.includes(NONCE)).length, 1)
  assert.ok(scripts.filter((s) => !s.includes(NONCE)).every((s) => s === '<script>'))
})

test('an item without a rendering shows its text as text', () => {
  // markdown.api.render can be unavailable; the text must still be readable and
  // still be inert.
  const html = boardPage({ nonce: NONCE, items: [item({ description: '<b>raw</b>' })], rendered: new Map() })
  assert.ok(html.includes('&lt;b&gt;raw&lt;/b&gt;'))
})

test('both views and every item are on the page', () => {
  const items = [
    item({ id: 'a', title: 'Alpha', status: 'deferred', labels: ['proposed'] }),
    item({ id: 'b', title: 'Beta', status: 'closed', closeReason: 'done' }),
    item({ id: 'c', title: 'Gamma', type: 'bug', labels: ['defect'], debtKind: 'defect' }),
  ]
  const html = boardPage({ nonce: NONCE, items, rendered: new Map() })
  assert.ok(html.includes('data-tab="board"') && html.includes('data-tab="backlog"'))
  for (const title of ['Alpha', 'Beta', 'Gamma']) assert.ok(html.includes(title), title)
  assert.ok(html.includes('Proposals'))
  assert.ok(html.includes('defect'))
})

test('nothing on the page offers to change the tracker', () => {
  // The only messages the page sends are to read again and to open an item.
  const html = boardPage({ nonce: NONCE, items: [item({})], rendered: new Map() })
  const sent = [...html.matchAll(/postMessage\(\{\s*type:\s*'([a-z]+)'/g)].map((m) => m[1])
  assert.deepEqual([...new Set(sent)].sort(), ['refresh'])
  // No form and no textarea; the one input is the backlog's keyword search,
  // which filters the page and writes nothing.
  assert.ok(!/<(form|textarea)\b/.test(html))
  for (const input of html.match(/<input\b[^>]*>/g) ?? []) assert.match(input, /type="search"/)
})

test('a page that only says something carries the same policy', () => {
  const html = messagePage({ nonce: NONCE, title: 'Not running', body: 'The container <is> stopped.' })
  assert.ok(html.includes(CSP(NONCE)))
  assert.ok(html.includes('The container &lt;is&gt; stopped.'))
})

test('a notice is said above the board, as text', () => {
  // When markdown.api.render is unavailable the items are plain text, and the
  // page says why rather than leaving the operator to wonder.
  const html = boardPage({ nonce: NONCE, items: [item({})], rendered: new Map(), notice: 'Markdown <off>' })
  assert.ok(html.includes('Markdown &lt;off&gt;'))
})

// --- Azure DevOps's shape (task: the-board-takes-azure-devops-shape) --------

test('the page script never builds HTML from data', () => {
  // The client only toggles attributes. Building markup in the browser from
  // item data would reopen what the policy closed.
  const html = boardPage({ nonce: NONCE, items: [item({})], rendered: new Map() })
  const script = html.slice(html.indexOf(`<script nonce="${NONCE}">`))
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
    assert.ok(!script.includes(sink), sink)
  }
})

test('a card shows its type by Azure DevOps\'s name and colour, with ID, state and tags', () => {
  const html = boardPage({
    nonce: NONCE,
    items: [item({ id: 's-1', title: 'A story', type: 'feature', status: 'in_progress', labels: ['ux'] })],
    rendered: new Map(),
  })
  assert.ok(html.includes('User Story'))
  assert.ok(html.includes('#009CCC'))
  assert.ok(html.includes('s-1') && html.includes('In progress') && html.includes('>ux<'))
})

test('a debt\'s kind and a proposal are tags', () => {
  const html = boardPage({
    nonce: NONCE,
    items: [
      item({ id: 'd-1', type: 'bug', labels: ['defect'], debtKind: 'defect' }),
      item({ id: 'p-1', type: 'feature', status: 'deferred', labels: ['proposed'] }),
    ],
    rendered: new Map(),
  })
  assert.ok(html.includes('>defect<'))
  assert.ok(html.includes('>Proposal<'))
})

test('the backlog is a grid with ID, Title, State and Tags, open and collapsible', () => {
  const items = [item({ id: 'e-1', type: 'epic', title: 'Epic <one>' }), item({ id: 's-1', type: 'feature', title: 'Story', parent: 'e-1' })]
  const html = boardPage({ nonce: NONCE, items, rendered: new Map() })
  for (const h of ['ID', 'Title', 'State', 'Tags']) assert.match(html, new RegExp(`<th[^>]*>${h}</th>`), h)
  assert.ok(html.includes('id="expand-all"') && html.includes('id="collapse-all"'))
  assert.ok(html.includes('data-toggle="e-1"'))
  assert.ok(!/<tr[^>]*data-row="s-1"[^>]*hidden/.test(html), 'the grid opens expanded')
  assert.ok(html.includes('Epic &lt;one&gt;') && !html.includes('Epic <one>'))
})

test('the form links its parent and its children', () => {
  const items = [
    item({ id: 'e-1', type: 'epic', title: 'Epic' }),
    item({ id: 's-1', type: 'feature', title: 'Story', parent: 'e-1' }),
    item({ id: 't-1', type: 'task', title: 'Task', parent: 's-1' }),
  ]
  const html = boardPage({ nonce: NONCE, items, rendered: new Map() })
  const form = html.slice(html.indexOf('data-detail="s-1"'), html.indexOf('</section>', html.indexOf('data-detail="s-1"')))
  assert.ok(form.includes('Parent') && form.includes('data-open="e-1"'))
  assert.ok(form.includes('Children') && form.includes('data-open="t-1"'))
})

test('no element carries a style attribute, because the policy would drop it silently', () => {
  // style-src allows the page's nonce'd stylesheet only. An inline style=""
  // is blocked by the webview with nothing said, so colours and indentation
  // must come from classes defined in that stylesheet.
  const items = [
    item({ id: 'e-1', type: 'epic' }),
    item({ id: 's-1', type: 'feature', parent: 'e-1' }),
    item({ id: 'x-1', type: 'chore' }),
  ]
  const html = boardPage({ nonce: NONCE, items, rendered: new Map() })
  assert.equal((html.match(/\sstyle="/g) ?? []).length, 0)
  for (const c of ['type-epic', 'type-feature', 'type-other', 'depth-1']) assert.ok(html.includes(c), c)
})

// --- filter, sort and the dialog (task: the-backlog-filters-sorts-and-opens-a-dialog)

import { orderedIds, visibleIds } from './board-filter.ts'
import vm from 'node:vm'

const tree = [
  item({ id: 'e-1', type: 'epic', title: 'Epic' }),
  item({ id: 's-1', type: 'feature', title: 'Story', parent: 'e-1', labels: ['ux'] }),
  item({ id: 't-1', type: 'task', title: 'Task <b>', parent: 's-1', status: 'closed' }),
]

test('the backlog has a keyword box and type, state and tag filters built from the items present', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  assert.match(html, /<input id="f-text" type="search"/)
  for (const id of ['f-type', 'f-state', 'f-tag']) assert.ok(html.includes(`<select id="${id}"`), id)
  assert.ok(html.includes('<option value="User Story">User Story</option>'))
  assert.ok(html.includes('<option value="Closed">Closed</option>'))
  assert.ok(html.includes('<option value="ux">ux</option>'))
})

test('each backlog row carries what the filter reads, escaped', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  const row = html.match(/<tr data-row="t-1"[^>]*>/)?.[0] ?? ''
  assert.ok(row.includes('data-parent="s-1"') && row.includes('data-type="Task"') && row.includes('data-state="Closed"'))
  assert.ok(row.includes('data-title="Task &lt;b&gt;"'))
})

test('the column headers sort, and say how', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  for (const c of ['id', 'title', 'state', 'tags']) assert.ok(html.includes(`data-sort="${c}"`), c)
  assert.ok(html.includes('id="no-match"'))
})

test('the page runs the same filter and sort the tests prove', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  const script = html.slice(html.indexOf(`<script nonce="${NONCE}">`) + `<script nonce="${NONCE}">`.length, html.lastIndexOf('</script>'))
  const embedded = script.slice(0, script.indexOf('// -- page --'))
  // const declarations do not become properties of a vm context, so the
  // embedded source is asked to hand both functions back.
  const ctx = vm.runInContext(`${embedded}; ({ visibleIds, orderedIds })`, vm.createContext({})) as {
    visibleIds: typeof visibleIds
    orderedIds: typeof orderedIds
  }
  const rows = tree.map((i) => ({ id: i.id, parent: i.parent, type: 'x', state: 'Open', tags: [], title: i.title }))
  assert.deepEqual([...ctx.orderedIds(rows, 'title', 'desc')], orderedIds(rows, 'title', 'desc'))
  assert.deepEqual([...ctx.visibleIds(rows, { text: 'task', type: '', state: '', tag: '' }).shown],
    [...visibleIds(rows, { text: 'task', type: '', state: '', tag: '' }).shown])
})

test('every form is inside one dialog, opened over the view and closed with a button', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  const dialog = html.slice(html.indexOf('<dialog id="detail"'), html.indexOf('</dialog>'))
  assert.ok(dialog.length > 0, 'a dialog')
  for (const id of ['e-1', 's-1', 't-1']) assert.ok(dialog.includes(`data-detail="${id}"`), id)
  assert.ok(dialog.includes('id="close-detail"'))
  assert.ok(html.includes('showModal()') && html.includes('.close()'))
})
