import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hiddenClosed } from './board-filter.ts'
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
  const html = boardPage({ nonce: NONCE, items: [item({})], rendered: new Map() })
  const sent = [...html.matchAll(/postMessage\(\{\s*type:\s*'([a-z]+)'/g)].map((m) => m[1])
  // Since story nmf.2 the page also asks to remember the board view, which
  // writes the workspace's own memory (board-message.ts), never the tracker.
  assert.deepEqual([...new Set(sent)].sort(), ['copy', 'refresh', 'view'])
  // No form and no textarea. The inputs are the backlog's keyword search and,
  // since story nmf.1, the "Show closed" checkbox: both filter the page and
  // write nothing, and they are named here one by one, so any other input fails.
  assert.ok(!/<(form|textarea)\b/.test(html))
  for (const input of html.match(/<input\b[^>]*>/g) ?? []) {
    assert.match(input, /type="search"|type="checkbox" id="show-closed"/, input)
  }
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
  assert.ok(html.includes('#4daafc'))
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

test('the backlog is a grid, open and collapsible', () => {
  const items = [item({ id: 'e-1', type: 'epic', title: 'Epic <one>' }), item({ id: 's-1', type: 'feature', title: 'Story', parent: 'e-1' })]
  const html = boardPage({ nonce: NONCE, items, rendered: new Map() })
  for (const h of ['Item', 'State', 'Tags']) assert.match(html, new RegExp(`<th[^>]*>${h}</th>`), h)
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

test('the filter bar has a keyword box and type, state and tag values built from the items present', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  assert.match(html, /<input id="f-text" type="search"/)
  const value = (field: string, v: string) => new RegExp(`data-field="${field}"[^]*?<div class="pop-row[^"]*" data-value="${v}" data-mode="">`)
  assert.match(html, value('type', 'User Story'))
  assert.match(html, value('state', 'Closed'))
  assert.match(html, value('tag', 'ux'))
})

test('each backlog row carries what the filter reads, escaped', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  const row = html.match(/<tr data-row="t-1"[^>]*>/)?.[0] ?? ''
  assert.ok(row.includes('data-parent="s-1"') && row.includes('data-type="Task"') && row.includes('data-state="Closed"'))
  assert.ok(row.includes('data-title="Task &lt;b&gt;"'))
})

test('the column headers sort, and say how', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  for (const c of ['title', 'state', 'tags']) assert.ok(html.includes(`data-sort="${c}"`), c)
  assert.ok(html.includes('id="no-match"'))
})

test('the page runs the same filter and sort the tests prove', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  const script = html.slice(html.indexOf(`<script nonce="${NONCE}">`) + `<script nonce="${NONCE}">`.length, html.lastIndexOf('</script>'))
  const embedded = script.slice(0, script.indexOf('// -- page --'))
  // const declarations do not become properties of a vm context, so the
  // embedded source is asked to hand both functions back.
  const ctx = vm.runInContext(`${embedded}; ({ visibleIds, orderedIds, hiddenClosed })`, vm.createContext({})) as {
    visibleIds: typeof visibleIds
    orderedIds: typeof orderedIds
    hiddenClosed: typeof hiddenClosed
  }
  const rows = tree.map((i, n) => ({ id: i.id, parent: i.parent, type: 'x', state: n % 2 === 0 ? 'Open' : 'Closed', tags: [], title: i.title, priority: '' }))
  const ANY = { include: [] as string[], exclude: [] as string[], all: false }
  const ANY_FIELD = { include: [] as string[], exclude: [] as string[], all: false }
  const f = { text: 'task', type: ANY, state: ANY, tag: ANY, priority: ANY_FIELD, showClosed: false }
  assert.deepEqual([...ctx.orderedIds(rows, 'title', 'desc')], orderedIds(rows, 'title', 'desc'))
  assert.deepEqual([...ctx.visibleIds(rows, f).shown], [...visibleIds(rows, f).shown])
  // Flat rows, so no closed one is an open one's context: the count is not 0,
  // and a page that counted differently could not agree with it by chance.
  const flat = rows.map((x) => ({ ...x, parent: undefined }))
  const all = { ...f, text: '' }
  assert.ok(hiddenClosed(flat, all) > 0, 'the fixture hides something')
  assert.equal(ctx.hiddenClosed(flat, all), hiddenClosed(flat, all))
})

test('every form is inside one dialog, opened over the view and closed with a button', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  const dialog = html.slice(html.indexOf('<dialog id="detail"'), html.indexOf('</dialog>'))
  assert.ok(dialog.length > 0, 'a dialog')
  for (const id of ['e-1', 's-1', 't-1']) assert.ok(dialog.includes(`data-detail="${id}"`), id)
  assert.ok(dialog.includes('id="close-detail"'))
  assert.ok(html.includes('showModal()') && html.includes('.close()'))
})

// --- closed work stays out of the way (story nmf.1, task nmf.1.1)

test('one "Show closed" toggle, off, serves the board and the backlog', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  const nav = html.slice(html.indexOf('<div class="filters">'), html.indexOf('data-view="board"'))
  assert.match(nav, /<input type="checkbox" id="show-closed"(?![^>]*checked)[^>]*>/)
  assert.match(nav, /Show closed/)
})

test("the board's Closed column is the one the toggle hides", () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  assert.match(html, /<div class="column" data-column="closed"/)
})

test('the page applies the toggle when it loads, not only when an input changes', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  const script = html.slice(html.indexOf(`<script nonce="${NONCE}">`), html.lastIndexOf('</script>'))
  assert.match(script, /showClosed: field\('show-closed'\)\.checked/)
  assert.match(script, /\nrelayout\(\);\n/, 'relayout runs once on load')
  assert.match(script, /field\('show-closed'\)\.addEventListener\('change'/)
})

// --- the board switches between views (story nmf.2, task nmf.2.1)

const viewItems: Item[] = [
  item({ id: 'e1', title: 'An epic', type: 'epic' }),
  item({ id: 's1', title: 'A story', type: 'feature', parent: 'e1' }),
  item({ id: 't1', title: 'A task', type: 'task', parent: 's1', status: 'in_progress' }),
  item({ id: 'd1', title: 'A debt', type: 'bug', labels: ['defect'], debtKind: 'defect' }),
]

test('each view is rendered, and only the chosen one is shown', () => {
  const html = boardPage({ nonce: NONCE, items: viewItems, rendered: new Map(), view: 'tasks' })
  assert.match(html, /<div data-board="tasks">/)
  assert.match(html, /<div data-board="stories" hidden>/)
  assert.match(html, /<div data-board="all" hidden>/)
})

test('with no view given, the board opens on All items, as it was', () => {
  const html = boardPage({ nonce: NONCE, items: viewItems, rendered: new Map() })
  assert.match(html, /<div data-board="all">/)
})

test('Stories by epic draws a lane per epic and one for what has no epic', () => {
  const html = boardPage({ nonce: NONCE, items: viewItems, rendered: new Map(), view: 'stories' })
  const stories = html.slice(html.indexOf('<div data-board="stories"'), html.indexOf('<div data-board="all"'))
  assert.match(stories, /<section class="lane" data-lane="e1" data-lane-closed="false">[^]*?<span class="lane-title">An epic<\/span>/)
  assert.match(stories, /<section class="lane" data-lane="" data-lane-closed="false">[^]*?<span class="lane-title">No epic<\/span>/)
  assert.match(stories, /data-column="in_development"[^]*A story/)
  assert.match(stories, /data-column="no_task"[^]*A debt/)
})

test('choosing a view tells the extension, and the Done columns follow Show closed', () => {
  const html = boardPage({ nonce: NONCE, items: viewItems, rendered: new Map() })
  const script = html.slice(html.indexOf(`<script nonce="${NONCE}">`), html.lastIndexOf('</script>'))
  assert.match(script, /vscode\.postMessage\(\{ type: 'view', view: /)
  assert.match(script, /\[data-column="done"\]/)
})

// --- where each item is in the chain (story nmf.3, task nmf.3.1)

const chain: Item[] = [
  item({ id: 's-v', title: 'Built story', type: 'feature', priority: 1 }),
  item({ id: 't-v', title: 'Done task', type: 'task', parent: 's-v', status: 'closed', closeReason: 'Merged in #9' }),
  item({ id: 't-r', title: 'Pickable', type: 'task', acceptance: 'done when x', priority: 2, metadata: { pr: 278 } }),
  item({ id: 't-n', title: 'No criterion', type: 'task' }),
]

test('cards and rows carry their place in the chain', () => {
  // On All items: in Stories by epic the Awaiting verification column already says it.
  const page = boardPage({ nonce: NONCE, items: chain, rendered: new Map(), view: 'all' })
  const html = page.slice(page.indexOf('<div data-board="all"'))
  const card = (id: string) => html.slice(html.indexOf(`data-open="${id}"`), html.indexOf('</button>', html.indexOf(`data-open="${id}"`)))
  assert.match(card('s-v'), /<span class="mark">Awaiting verification<\/span>/)
  assert.match(card('t-r'), /<span class="mark">Ready<\/span>/)
  assert.match(card('t-n'), /<span class="mark">Ready<\/span><span class="mark warn">no done criterion<\/span>/)
  assert.match(card('t-r'), /<span class="prio">P2<\/span>/)
})

test('a task\'s pull request is a link beside its card, never inside the button', () => {
  const html = boardPage({ nonce: NONCE, items: chain, rendered: new Map(), view: 'all', remote: 'git@github.com:TheHefty/x.git' })
  assert.match(html, /<\/button><a class="pr" href="https:\/\/github\.com\/TheHefty\/x\/pull\/278">#278<\/a>/)
  for (const b of html.match(/<button\b[^]*?<\/button>/g) ?? []) assert.doesNotMatch(b, /<a\b/, 'an anchor inside a button')
})

test('with a remote that is not GitHub the number is shown as text', () => {
  const html = boardPage({ nonce: NONCE, items: chain, rendered: new Map(), view: 'all', remote: 'https://gitlab.com/a/b.git' })
  assert.match(html, /<span class="pr">#278<\/span>/)
  assert.doesNotMatch(html, /<a class="pr"/)
})

test('the backlog has a Priority column, and sorts by it', () => {
  const html = boardPage({ nonce: NONCE, items: chain, rendered: new Map() })
  assert.match(html, /<th data-sort="priority" aria-sort="none">Priority<\/th>/)
  assert.match(html, /data-row="t-r"[^>]*data-priority="2"/)
  assert.match(html, /data-row="t-n"[^>]*data-priority=""/)
})

// --- filters combine (story nmf.4, task nmf.4.1)

test('one filter bar stands above both tabs', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  const bar = html.indexOf('<div class="filters">')
  assert.ok(bar > html.indexOf('</nav>') && bar < html.indexOf('data-view="board"'), 'after the nav, before the views')
  assert.equal(html.split('<div class="filters">').length - 1, 1, 'only one')
})

test('tags have an Any/All switch; type and state do not', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  assert.match(html, /<button id="tag-all" aria-pressed="false">All of<\/button>/)
  assert.equal(html.split('All of</button>').length - 1, 1)
})

test('the board and the backlog keep the same items for the same filter', () => {
  const items: Item[] = [
    item({ id: 'e', type: 'epic', title: 'Epic' }),
    item({ id: 'a', type: 'task', title: 'A', parent: 'e', labels: ['defect', 'hotfix'] }),
    item({ id: 'b', type: 'task', title: 'B', parent: 'e', labels: ['defect'] }),
    item({ id: 'c', type: 'bug', title: 'C', labels: ['hotfix', 'defect'], debtKind: 'defect' }),
    item({ id: 'd', type: 'feature', title: 'D', parent: 'e', labels: ['study'] }),
  ]
  const html = boardPage({ nonce: NONCE, items, rendered: new Map(), view: 'all' })
  const script = html.slice(html.indexOf(`<script nonce="${NONCE}">`) + `<script nonce="${NONCE}">`.length, html.lastIndexOf('</script>'))
  const ctx = vm.runInContext(`${script.slice(0, script.indexOf('// -- page --'))}; ({ visibleIds })`, vm.createContext({})) as { visibleIds: typeof visibleIds }
  const attr = (tag: string, name: string) => (tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '').replace(/&amp;/g, '&')
  const rowsOf = (pattern: RegExp, idAttr: string, withParent: boolean) => (html.match(pattern) ?? []).map((t) => ({
    id: attr(t, idAttr), parent: withParent ? attr(t, 'data-parent') || undefined : undefined,
    type: attr(t, 'data-type'), state: attr(t, 'data-state'), title: attr(t, 'data-title'), priority: attr(t, 'data-priority'),
    tags: attr(t, 'data-tags') === '' ? [] : attr(t, 'data-tags').split('\u001f'),
  }))
  const allBoard = html.slice(html.indexOf('<div data-board="all"'))
  const cards = rowsOf(/<div class="card-wrap" data-card="[^"]*"[^>]*>/g, 'data-card', false)
    .filter((c) => allBoard.includes(`data-card="${c.id}"`))
  const rows = rowsOf(/<tr data-row="[^"]*"[^>]*>/g, 'data-row', true)
  const ANY = { include: [] as string[], exclude: [] as string[], all: false }
  for (const f of [
    { text: '', type: { ...ANY, exclude: ['Bug'] }, state: ANY, tag: ANY, priority: ANY, showClosed: true },
    { text: '', type: ANY, state: ANY, tag: { include: ['defect', 'hotfix'], exclude: [], all: true }, priority: ANY, showClosed: true },
    { text: '', type: { ...ANY, include: ['Task'] }, state: ANY, tag: { ...ANY, exclude: ['hotfix'] }, priority: ANY, showClosed: true },
  ]) {
    const board = [...ctx.visibleIds(cards, f).shown].sort()
    const v = ctx.visibleIds(rows, f)
    const backlog = [...v.shown].filter((id) => !v.context.has(id)).sort()
    assert.deepEqual(board, backlog, JSON.stringify(f))
    assert.deepEqual([...ctx.visibleIds(cards, f).context], [], 'no context on the board')
  }
})

test('the page reads the value buttons, and filters the board\'s cards with the same function', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  const script = html.slice(html.indexOf(`<script nonce="${NONCE}">`), html.lastIndexOf('</script>'))
  assert.match(script, /\[data-field="' \+ name \+ '"\] \[data-value\]/)
  assert.match(script, /visibleIds\(cardRows, f\)/)
})

test('the picker offers Tasks by story, and draws its lanes as Epic › Story (story nmf.5)', () => {
  const html = boardPage({ nonce: NONCE, items: viewItems, rendered: new Map(), view: 'by-story' })
  assert.match(html, /<option value="by-story" selected>Tasks by story<\/option>/)
  const lanes = html.slice(html.indexOf('<div data-board="by-story"'), html.indexOf('<div data-board="stories"'))
  assert.match(lanes, /<section class="lane" data-lane="s1" data-lane-closed="false">[^]*?<span class="lane-title">An epic › A story<\/span>/)
  assert.match(lanes, /data-column="in_progress"[^]*A task/)
})

// --- the board is drawn as lanes and cards (story dox.1, task dox.1.1)

const lanes: Item[] = [
  item({ id: 'e1', title: 'An epic', type: 'epic' }),
  item({ id: 'quiet', title: 'A quiet epic', type: 'epic' }),
  item({ id: 's1', title: 'A story', type: 'feature', parent: 'e1' }),
  item({ id: 't1', title: 'A task', type: 'task', parent: 's1', status: 'in_progress', priority: 1 }),
  item({ id: 'd1', title: 'A debt', type: 'bug', labels: ['defect'], debtKind: 'defect', priority: 3 }),
]
const boardOf = (html: string, name: string) => {
  const at = html.indexOf(`<div data-board="${name}"`)
  const next = html.indexOf('<div data-board="', at + 1)
  return html.slice(at, next === -1 ? html.indexOf('data-view="backlog"') : next)
}

test('Group by is one dropdown in the design\'s order, the chosen view selected', () => {
  const html = boardPage({ nonce: NONCE, items: lanes, rendered: new Map(), view: 'by-story' })
  const select = html.slice(html.indexOf('<select id="group-by"'), html.indexOf('</select>'))
  assert.deepEqual([...select.matchAll(/<option value="([a-z-]+)"/g)].map((m) => m[1]), ['stories', 'by-story', 'tasks', 'all'])
  assert.match(select, /<option value="by-story" selected>Tasks by story<\/option>/)
  assert.ok(!html.includes('data-board-view='), 'no view buttons left')
})

test('column titles appear once per view, and lanes repeat none', () => {
  const html = boardPage({ nonce: NONCE, items: lanes, rendered: new Map(), view: 'stories' })
  const stories = boardOf(html, 'stories')
  assert.equal((stories.match(/class="col-title[ "]/g) ?? []).length, 4)
  assert.ok(!/<h2>/.test(stories), 'no per-lane column heading')
  assert.match(stories, /Not started <span class="count" data-col-count="no_task">\d+<\/span>/)
})

test('the column titles stay in sight, because nothing between them and the page scrolls', () => {
  const html = boardPage({ nonce: NONCE, items: lanes, rendered: new Map() })
  assert.match(html, /\.col-titles \{[^}]*position: sticky/)
  assert.doesNotMatch(html, /\.board-grid \{[^}]*overflow/, 'a scroll container would make sticky useless')
})

test('a title follows Show closed with its column, so the grid stays aligned', () => {
  const html = boardPage({ nonce: NONCE, items: lanes, rendered: new Map(), view: 'stories' })
  assert.match(boardOf(html, 'stories'), /class="col-title[^"]*" data-column="done"/)
})

test('a lane is a button saying its title, ID and summary, and a quiet one starts collapsed', () => {
  const html = boardPage({ nonce: NONCE, items: lanes, rendered: new Map(), view: 'stories' })
  const stories = boardOf(html, 'stories')
  const head = (key: string) => stories.slice(stories.indexOf(`data-lane="${key}"`), stories.indexOf('</button>', stories.indexOf(`data-lane="${key}"`)))
  assert.match(head('e1'), /<button class="lane-head" data-lane-toggle aria-expanded="true">/)
  assert.match(head('e1'), /An epic<\/span><span class="id">e1<\/span><span class="lane-summary">1 open story · 1 in development<\/span>/)
  assert.match(head('quiet'), /aria-expanded="false"/)
  assert.match(head('quiet'), /No open stories/)
})

test('a filter cannot reopen a collapsed lane, because collapsing is only the button\'s state', () => {
  const html = boardPage({ nonce: NONCE, items: lanes, rendered: new Map() })
  assert.match(html, /\.lane-head\[aria-expanded="false"\] \+ \.columns \{ display: none; \}/)
  const script = html.slice(html.indexOf(`<script nonce="${NONCE}">`), html.lastIndexOf('</script>'))
  const relayout = script.slice(script.indexOf('const relayout'), script.indexOf("field('f-text').addEventListener"))
  assert.ok(!relayout.includes('aria-expanded="') && !relayout.includes('data-lane-toggle'), 'relayout never touches the lane button')
})

test('a card shows icon, type, ID and priority on top, its title clamped, its marks and PR kept', () => {
  const items = [item({ id: 't', title: 'T', type: 'task', priority: 2, acceptance: 'x', metadata: { pr: 7 } })]
  const html = boardPage({ nonce: NONCE, items, rendered: new Map(), view: 'tasks', remote: 'git@github.com:a/b.git' })
  const board = boardOf(html, 'tasks')
  const card = board.slice(board.indexOf('data-open="t"'), board.indexOf('</button>', board.indexOf('data-open="t"')))
  assert.match(card, /<span class="card-head"><svg class="icon"[^]*?<\/svg><span class="type">Task<\/span><span class="id">t<\/span><span class="prio">P2<\/span><\/span>/)
  assert.match(card, /<span class="title clamp">T<\/span>/)
  assert.match(card, /<span class="mark">Ready<\/span>/)
  assert.match(board, /<\/button><a class="pr" href="https:\/\/github\.com\/a\/b\/pull\/7">#7<\/a>/)
})

test('a card does not repeat the state its column already says', () => {
  const items = [
    item({ id: 'd', type: 'bug', labels: ['defect'], debtKind: 'defect', status: 'in_progress' }),
    item({ id: 's', type: 'feature' }),
    item({ id: 't', type: 'task', parent: 's', status: 'in_progress' }),
  ]
  const board = boardOf(boardPage({ nonce: NONCE, items, rendered: new Map(), view: 'stories' }), 'stories')
  const card = (id: string) => board.slice(board.indexOf(`data-open="${id}"`), board.indexOf('</button>', board.indexOf(`data-open="${id}"`)))
  assert.match(card('d'), /<span class="pill state-in-progress">In progress<\/span>/, 'Not started, yet its stored state is in progress')
  assert.doesNotMatch(card('s'), /class="pill/, 'In development says it')
  assert.match(card('s'), /1 task in progress/)
})

test('the column counts follow the filter', () => {
  const html = boardPage({ nonce: NONCE, items: lanes, rendered: new Map() })
  const script = html.slice(html.indexOf(`<script nonce="${NONCE}">`), html.lastIndexOf('</script>'))
  assert.match(script, /querySelectorAll\('\[data-col-count\]'\)/)
})

test('the board follows the editor\'s theme: only type and state accents are fixed, and light has its own', () => {
  const html = boardPage({ nonce: NONCE, items: lanes, rendered: new Map() })
  const style = html.slice(html.indexOf(`<style nonce="${NONCE}">`), html.indexOf('</style>'))
  const fixed = style.split('\n').filter((l) => /#[0-9a-fA-F]{3,8}\b/.test(l) && !/^\s*(body\.vscode-light )?\.?[a-z-]*\s*\{?\s*--(type-colour|state-)/.test(l) && !/^\.(type|state)-/.test(l))
  assert.deepEqual(fixed, [], 'a colour outside the accents')
  assert.match(style, /body\.vscode-light \.type-task \{ --type-colour:/)
  assert.match(style, /body\.vscode-light \.state-in-progress \{/)
  assert.match(style, /background: var\(--vscode-editorWidget-background\)/)
})

// --- the backlog is drawn as a hierarchy grid (story dox.2, task dox.2.1)

const grid: Item[] = [
  item({ id: 'e-1', title: 'Epic', type: 'epic', status: 'closed' }),
  item({ id: 's-1', title: 'Story', type: 'feature', parent: 'e-1', priority: 1 }),
  item({ id: 't-1', title: 'Task', type: 'task', parent: 's-1', status: 'in_progress' }),
  item({ id: 'd-1', title: 'Debt', type: 'bug', labels: ['defect'], debtKind: 'defect' }),
  item({ id: 'dt', title: 'Done', type: 'task', parent: 'd-1', status: 'closed' }),
]
const rowOf = (html: string, id: string) => {
  const at = html.indexOf(`<tr data-row="${id}"`)
  return html.slice(at, html.indexOf('</tr>', at))
}

test('the grid has Item, State, Priority and Tags, and Item sorts by title', () => {
  const html = boardPage({ nonce: NONCE, items: grid, rendered: new Map() })
  const head = html.slice(html.indexOf('<table class="backlog">'), html.indexOf('</thead>'))
  assert.deepEqual([...head.matchAll(/<th[^>]*>([A-Za-z]+)<\/th>/g)].map((m) => m[1]), ['Item', 'State', 'Priority', 'Tags'])
  assert.match(head, /<th data-sort="title"[^>]*>Item<\/th>/)
  assert.match(head, /<th data-sort="priority"[^>]*>Priority<\/th>/)
})

test('a row shows its depth, chevron, icon, ID and title in the Item cell', () => {
  const html = boardPage({ nonce: NONCE, items: grid, rendered: new Map() })
  const row = rowOf(html, 't-1')
  assert.match(row, /<td class="item-cell type-task depth-2">/)
  assert.match(row, /<svg class="icon"[^]*?<span class="id">t-1<\/span><button class="link ttl" data-open="t-1">Task<\/button>/)
  assert.match(rowOf(html, 's-1'), /<button class="toggle chev" data-toggle="s-1" aria-expanded="true" aria-label="Expand or collapse"><svg/)
})

test('a row\'s state is a pill saying where it stands in the chain', () => {
  const html = boardPage({ nonce: NONCE, items: grid, rendered: new Map() })
  assert.match(rowOf(html, 't-1'), /<span class="pill state-in-progress">In progress<\/span>/)
  const debt = rowOf(html, 'd-1')
  assert.match(debt, /<span class="pill state-awaiting">Awaiting verification<\/span>/)
  assert.doesNotMatch(debt, /class="mark">Awaiting/, 'said once')
  assert.match(debt, /data-state="Open"/, 'the filter still reads the stored state')
})

test('a collapsed parent says how many it hides, counting only what the filter keeps', () => {
  const html = boardPage({ nonce: NONCE, items: grid, rendered: new Map() })
  assert.match(rowOf(html, 's-1'), /<span class="hidden-count" data-hidden-count="s-1" hidden><\/span>/)
  assert.doesNotMatch(rowOf(html, 't-1'), /data-hidden-count/)
  const script = html.slice(html.indexOf(`<script nonce="${NONCE}">`), html.lastIndexOf('</script>'))
  assert.match(script, /querySelectorAll\('\[data-hidden-count\]'\)/)
  assert.match(script, /v\.shown\.has\(d\.id\)/, 'what the filter hides is not counted')
})

test('Expand all and Collapse all are icon buttons in the header, shown with the backlog', () => {
  const html = boardPage({ nonce: NONCE, items: grid, rendered: new Map() })
  const header = html.slice(html.indexOf('<header class="bar">'), html.indexOf('</header>'))
  assert.match(header, /<span class="backlog-tools" hidden>/)
  assert.match(header, /<button id="expand-all" class="iconbtn" aria-label="Expand all" title="Expand all"><svg/)
  assert.match(header, /<button id="collapse-all" class="iconbtn" aria-label="Collapse all" title="Collapse all"><svg/)
  const script = html.slice(html.indexOf(`<script nonce="${NONCE}">`), html.lastIndexOf('</script>'))
  assert.match(script, /querySelector\('\.backlog-tools'\)\.hidden = b\.dataset\.tab !== 'backlog'/)
})

test('a long title cannot push the state off its row', () => {
  const html = boardPage({ nonce: NONCE, items: grid, rendered: new Map() })
  assert.match(html, /table\.backlog \{[^}]*table-layout: fixed/)
  assert.match(html, /\.ttl \{[^}]*text-overflow: ellipsis/)
})

// --- filters open as dropdowns (story dox.3, task dox.3.1)

const pageScript = (html: string) => html.slice(html.indexOf(`<script nonce="${NONCE}">`), html.lastIndexOf('</script>'))
const filterItems: Item[] = [
  item({ id: 'a', type: 'bug', priority: 3, labels: ['defect'], debtKind: 'defect' }),
  item({ id: 'b', type: 'epic', priority: 1, status: 'in_progress' }),
]

test('each field is a button opening its own hidden dropdown, Priority among them', () => {
  const html = boardPage({ nonce: NONCE, items: filterItems, rendered: new Map() })
  for (const [field, name] of [['type', 'Type'], ['state', 'State'], ['tag', 'Tags'], ['priority', 'Priority']]) {
    assert.match(html, new RegExp(`data-field="${field}"><button class="filt" data-filter-open aria-expanded="false">${name} `), field)
  }
  assert.equal(html.split('<div class="popover" role="dialog"').length - 1, 4)
  assert.equal((html.match(/<div class="popover" role="dialog"[^>]* hidden>/g) ?? []).length, 4)
  assert.match(html, /data-value="P3" data-mode=""/)
})

test('every value offers Include and Exclude, and Alt+click is said and handled', () => {
  const html = boardPage({ nonce: NONCE, items: filterItems, rendered: new Map() })
  assert.match(html, /<button class="tri" data-set="include" aria-pressed="false">\+ Include<\/button><button class="tri" data-set="exclude" aria-pressed="false">− Exclude<\/button>/)
  assert.match(html, /Alt\+click a value to exclude it/)
  assert.match(pageScript(html), /e\.altKey \? 'exclude'/)
})

test('a button summarises its field, and takes the colour of what it does', () => {
  const html = boardPage({ nonce: NONCE, items: filterItems, rendered: new Map() })
  assert.match(html, /\.filt\.on-exclude \{/)
  assert.match(html, /\.filt\.on-include \{/)
  const script = pageScript(html)
  assert.match(script, /querySelector\('\.filt-excluded'\)\.textContent/)
  assert.ok(!/innerHTML|insertAdjacentHTML/.test(script), 'the summary is text')
})

test('the page says how much the filter keeps, and offers to clear it', () => {
  const html = boardPage({ nonce: NONCE, items: filterItems, rendered: new Map() })
  assert.match(html, /<span id="filter-count" hidden><\/span>/)
  assert.match(html, /<button id="clear-filters" class="link" hidden>Clear filters<\/button>/)
  assert.match(pageScript(html), /' of ' \+ total \+ ' open items'/)
})

test('Show closed says how many it hides beside the toggle, for the tab in sight', () => {
  const html = boardPage({ nonce: NONCE, items: filterItems, rendered: new Map() })
  assert.match(html, /Show closed <span id="closed-count"><\/span>/)
  assert.ok(!html.includes('class="hidden-closed"'))
  assert.match(pageScript(html), /\+ ' hidden'/)
})

test('a slash goes to the search box, unless the developer is typing or reading an item', () => {
  const script = pageScript(boardPage({ nonce: NONCE, items: filterItems, rendered: new Map() }))
  assert.match(script, /e\.key === '\/' && !dialog\.open && !\['INPUT', 'SELECT'\]\.includes\(e\.target\.tagName\)/)
  assert.match(script, /preventDefault\(\); field\('f-text'\)\.focus\(\)/)
})

test('Esc and a click outside close a dropdown, and only that', () => {
  const script = pageScript(boardPage({ nonce: NONCE, items: filterItems, rendered: new Map() }))
  assert.match(script, /e\.key === 'Escape' && open\(\)/)
  assert.match(script, /!e\.target\.closest\('\.filter'\)/)
  const close = script.slice(script.indexOf('const closePopovers'), script.indexOf('\n', script.indexOf('const closePopovers')))
  assert.ok(!close.includes('relayout'), 'closing changes no filter')
})

// --- an item opens in a side panel (story dox.4, task dox.4.1)

const panelItems: Item[] = [
  item({ id: 'proj-e1', type: 'epic', title: 'Epic' }),
  item({ id: 'proj-s1', type: 'feature', title: 'Story', parent: 'proj-e1', status: 'in_progress', priority: 2, labels: ['ux'], acceptance: 'x' }),
  item({ id: 'proj-t1', type: 'task', title: 'Done', parent: 'proj-s1', status: 'closed' }),
]
const panel = (html: string, id: string) => html.slice(html.indexOf(`data-detail="${id}"`), html.indexOf('</section><section', html.indexOf(`data-detail="${id}"`)))

test('the panel stands on the right, and the view behind stays as it was', () => {
  const html = boardPage({ nonce: NONCE, items: panelItems, rendered: new Map() })
  assert.match(html, /dialog#detail \{[^}]*margin: 0 0 0 auto;[^}]*height: 100vh/)
  assert.ok(html.includes('showModal()'), 'still modal, so j and k cannot reach the view')
})

test('IDs are short where the design shows them, whole where they are copied and filtered', () => {
  const html = boardPage({ nonce: NONCE, items: panelItems, rendered: new Map(), view: 'all' })
  assert.match(html, /<span class="id">s1<\/span>/)
  assert.ok(!html.includes('<span class="id">proj-s1</span>'))
  assert.match(html, /data-card="proj-s1"/)
  assert.match(panel(html, 'proj-s1'), /<button class="iconbtn" data-copy="proj-s1" aria-label="Copy full ID proj-s1" title="Copy ID">/)
})

test('IDs with no common prefix stay whole', () => {
  const html = boardPage({ nonce: NONCE, items: [item({ id: 'a-1' }), item({ id: 'b-2' })], rendered: new Map() })
  assert.match(html, /<span class="id">a-1<\/span>/)
})

test('a lone item keeps its whole ID, rather than losing all of it to the prefix', () => {
  const html = boardPage({ nonce: NONCE, items: [item({ id: 'proj-1' })], rendered: new Map() })
  assert.match(html, /<span class="id">proj-1<\/span>/)
})

test('the fields say the state in both words, the priority, the tags and the parent', () => {
  const items = [
    item({ id: 'proj-s', type: 'feature', title: 'Built', status: 'in_progress', priority: 2, labels: ['ux'] }),
    item({ id: 'proj-t', type: 'task', title: 'T', parent: 'proj-s', status: 'closed', closeReason: 'merged' }),
  ]
  const form = panel(boardPage({ nonce: NONCE, items, rendered: new Map() }), 'proj-s')
  assert.match(form, /<dt>State<\/dt><dd><span class="pill state-awaiting">Awaiting verification<\/span> <span class="stored">bd state: in_progress<\/span><\/dd>/)
  assert.match(form, /<dt>Priority<\/dt><dd>P2<\/dd>/)
  assert.match(form, /<dt>Tags<\/dt><dd><span class="tag">ux<\/span><\/dd>/)
  assert.match(form, /<dt>Parent<\/dt><dd>None<\/dd>/)
})

test('Gherkin acceptance is drawn as scenario cards', () => {
  const items = [item({ id: 'g', acceptance: 'Feature: F\n\nScenario: First\n  Given x\n  Then y\n\nScenario: Second\n  When z' })]
  const form = panel(boardPage({ nonce: NONCE, items, rendered: new Map([['g', { acceptance: '<p>RENDERED</p>' }]]) }), 'g')
  assert.match(form, /<span class="gherkin-key">Feature:<\/span> F/)
  assert.equal(form.split('<div class="scenario">').length - 1, 2)
  assert.match(form, /<p class="scenario-name">First<\/p><div class="step"><span class="gherkin-key">Given<\/span><span>x<\/span><\/div>/)
  assert.ok(!form.includes('RENDERED'), 'drawn once')
})

test('acceptance that is not Gherkin stays as rendered Markdown', () => {
  const items = [item({ id: 'g', acceptance: 'done when it passes' })]
  const form = panel(boardPage({ nonce: NONCE, items, rendered: new Map([['g', { acceptance: '<p>RENDERED</p>' }]]) }), 'g')
  assert.ok(form.includes('RENDERED'))
  assert.ok(!form.includes('class="scenario"'))
})

test('what a scenario says is escaped, and gains no way to run', () => {
  const hostile = '<img src=x onerror=alert(1)>'
  const items = [item({ id: 'g', acceptance: `Feature: ${hostile}\nScenario: ${hostile}\n  Given ${hostile}` })]
  const html = boardPage({ nonce: NONCE, items, rendered: new Map() })
  assert.ok(!html.includes('<img'), 'escaped')
  assert.equal(html.split(`nonce="${NONCE}"`).length - 1, 2)
})

test('children are rows with their icon, ID, title and state, and a count', () => {
  const form = panel(boardPage({ nonce: NONCE, items: panelItems, rendered: new Map() }), 'proj-s1')
  assert.match(form, /Children <span class="count">1<\/span>/)
  assert.match(form, /<button class="child type-task" data-open="proj-t1"><svg[^]*?<span class="id">t1<\/span><span class="child-title">Done<\/span><span class="pill state-closed">Closed<\/span><\/button>/)
})

test('previous and next walk what is in sight, never what the filter hid', () => {
  const html = boardPage({ nonce: NONCE, items: panelItems, rendered: new Map() })
  const script = html.slice(html.indexOf(`<script nonce="${NONCE}">`), html.lastIndexOf('</script>'))
  assert.match(html, /id="prev-item" class="iconbtn" aria-label="Previous item" title="Previous \(k\)"/)
  assert.match(html, /id="next-item" class="iconbtn" aria-label="Next item" title="Next \(j\)"/)
  assert.match(script, /getClientRects\(\)\.length > 0/, 'hidden, collapsed and filtered rows take no space')
  assert.match(script, /e\.key === 'j'/)
  assert.match(script, /e\.key === 'k'/)
  assert.match(script, /vscode\.postMessage\(\{ type: 'copy', id: /)
})

test('a card is counted once, though every view it is in draws it', () => {
  // The same item has one card per board view, so a row picked by its ID alone
  // comes back once per view: found running the page, as "2 of 4 open items".
  const script = pageScript(boardPage({ nonce: NONCE, items: filterItems, rendered: new Map() }))
  assert.match(script, /cardRows\.filter\(\(r, i\) => shownBoard\.contains\(cardEls\[i\]\)\)/)
})
