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
  assert.deepEqual([...new Set(sent)].sort(), ['refresh', 'view'])
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

test('the filter bar has a keyword box and type, state and tag values built from the items present', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  assert.match(html, /<input id="f-text" type="search"/)
  const value = (field: string, v: string) => new RegExp(`data-field="${field}"[^]*?<button class="value" data-value="${v}" data-mode="">${v}</button>`)
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
  for (const c of ['id', 'title', 'state', 'tags']) assert.ok(html.includes(`data-sort="${c}"`), c)
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
  const f = { text: 'task', type: ANY, state: ANY, tag: ANY, showClosed: false }
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
  const nav = html.slice(html.indexOf('<nav>'), html.indexOf('</nav>'))
  assert.match(nav, /<input type="checkbox" id="show-closed"(?![^>]*checked)[^>]*>/)
  assert.match(nav, /Show closed/)
})

test('each view has a place to say how many closed items are hidden', () => {
  const html = boardPage({ nonce: NONCE, items: tree, rendered: new Map() })
  for (const view of ['board', 'backlog']) {
    const at = html.indexOf(`data-view="${view}"`)
    const next = html.indexOf('data-view=', at + 1)
    const part = html.slice(at, next === -1 ? undefined : next)
    assert.match(part, /class="hidden-closed"/, `${view} has no hidden count`)
  }
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

test('the board offers its three views, the chosen one pressed', () => {
  const html = boardPage({ nonce: NONCE, items: viewItems, rendered: new Map(), view: 'stories' })
  for (const [name, title] of [['tasks', 'Tasks'], ['stories', 'Stories by epic'], ['all', 'All items']]) {
    assert.match(html, new RegExp(`<button data-board-view="${name}" aria-pressed="${name === 'stories'}">${title}</button>`))
  }
})

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
  assert.match(stories, /<section class="lane" data-lane="e1" data-lane-closed="false"><h3>An epic<\/h3>/)
  assert.match(stories, /<section class="lane" data-lane="" data-lane-closed="false"><h3>No epic<\/h3>/)
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
  const html = boardPage({ nonce: NONCE, items: chain, rendered: new Map(), view: 'all' })
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
    { text: '', type: { ...ANY, exclude: ['Bug'] }, state: ANY, tag: ANY, showClosed: true },
    { text: '', type: ANY, state: ANY, tag: { include: ['defect', 'hotfix'], exclude: [], all: true }, showClosed: true },
    { text: '', type: { ...ANY, include: ['Task'] }, state: ANY, tag: { ...ANY, exclude: ['hotfix'] }, showClosed: true },
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
  assert.match(html, /<button data-board-view="by-story" aria-pressed="true">Tasks by story<\/button>/)
  const lanes = html.slice(html.indexOf('<div data-board="by-story"'), html.indexOf('<div data-board="stories"'))
  assert.match(lanes, /<section class="lane" data-lane="s1" data-lane-closed="false"><h3>An epic › A story<\/h3>/)
  assert.match(lanes, /data-column="in_progress"[^]*A task/)
})
