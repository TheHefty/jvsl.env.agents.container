/**
 * The board's HTML, as a pure function of what was read.
 *
 * **What an item says is content somebody wrote, and this page renders it.**
 * The rendered Markdown is HTML by design, so escaping cannot be what disarms
 * it. The Content Security Policy does: nothing runs without this page's nonce,
 * and nothing loads from anywhere. The nonce appears on exactly one script and
 * one style, both this page's own, and never inside an item. Titles and every
 * unrendered field are escaped text.
 *
 * **Opening an item needs no round trip.** Every item's content is in the page,
 * hidden until opened, so the only message the page sends is to read again.
 * Nothing on it changes the tracker (FR-118).
 */
import { hiddenClosed, orderedIds, visibleIds } from './board-filter.ts'
import { backlogRows, typeLook, type Item } from './board-read.ts'
import { boardView, chainMarks, VIEWS, type ChainMark, type ViewName } from './board-view.ts'
import { prLink } from './pr-link.ts'

export interface Rendered {
  description?: string
  acceptance?: string
  design?: string
  closeReason?: string
}

export function CSP(nonce: string): string {
  return (
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'none'; ` +
    `font-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`
  )
}

export function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const STYLE = `
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 12px; }
nav { display: flex; gap: 8px; align-items: center; margin: 12px 0; }
nav button, .card { font: inherit; color: inherit; cursor: pointer; }
nav button { background: none; border: 1px solid var(--vscode-panel-border); padding: 4px 10px; }
nav button[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
nav .spacer { flex: 1; }
.lane { margin-bottom: 14px; }
.filters .field { display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 4px 12px 4px 0; }
.filters .label { opacity: 0.75; margin-right: 2px; }
.value[data-mode="include"] { outline: 2px solid var(--vscode-focusBorder); }
.value[data-mode="include"]::before { content: "+ "; }
.value[data-mode="exclude"] { text-decoration: line-through; opacity: 0.7; }
.value[data-mode="exclude"]::before { content: "− "; }
#tag-all[aria-pressed="true"] { font-weight: bold; }
.mark, .prio { font-size: 0.75em; border: 1px solid var(--vscode-panel-border); border-radius: 3px; padding: 0 4px; margin-right: 4px; }
.mark.warn { border-color: var(--vscode-editorWarning-foreground, #cca700); }
.card-wrap { display: grid; }
.pr { font-size: 0.8em; margin: 2px 0 6px 6px; }
.lane > h3 { margin: 4px 0 6px; font-size: 1em; }
.views button[aria-pressed="true"] { font-weight: bold; }
.columns { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(180px, 1fr); gap: 10px; overflow-x: auto; }
.column h2 { font-size: 0.9em; text-transform: uppercase; opacity: 0.8; }
.card { display: block; width: 100%; text-align: left; margin: 0 0 6px; padding: 6px 8px;
  background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); }
.card.proposed { border-style: dashed; border-color: var(--vscode-focusBorder); }
.id, .kind, .state { font-size: 0.8em; opacity: 0.75; margin-right: 6px; }
.kind { color: var(--vscode-errorForeground); opacity: 1; }
ul.tree { list-style: none; padding-left: 16px; }
ul.tree > li { margin: 2px 0; }
[hidden] { display: none !important; }
.card { border-left: 4px solid var(--type-colour, #8A8886); }
.type { font-size: 0.8em; margin-right: 6px; }
.type::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 4px; background: var(--type-colour, #8A8886); }
.title { display: block; margin: 2px 0; }
.meta { font-size: 0.8em; opacity: 0.85; }
.tag { display: inline-block; font-size: 0.75em; padding: 0 6px; margin: 2px 4px 0 0; border-radius: 8px;
  background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
table.backlog { border-collapse: collapse; width: 100%; }
table.backlog th, table.backlog td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
table.backlog td.title-cell { border-left: 4px solid var(--type-colour, #8A8886); }
button.toggle { background: none; border: none; color: inherit; cursor: pointer; width: 1.5em; }
button.link { background: none; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; padding: 0; }
.links li { margin: 2px 0; }
.type-other { --type-colour: #8A8886; }
${['epic', 'feature', 'task', 'bug'].map((t) => `.type-${t} { --type-colour: ${typeLook(t).colour}; }`).join('\n')}
${Array.from({ length: 7 }, (_, d) => `td.depth-${d} { padding-left: ${d * 20 + 8}px; }`).join('\n')}
dialog#detail { width: min(900px, 92vw); max-height: 85vh; overflow: auto; padding: 16px 20px;
  color: var(--vscode-foreground); background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); }
dialog#detail::backdrop { background: rgba(0, 0, 0, 0.45); }
#close-detail { float: right; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.filters input, .filters select { font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); padding: 2px 6px; }
tr.context { opacity: 0.5; }
th[data-sort] { cursor: pointer; user-select: none; }
th[aria-sort="ascending"]::after { content: " ▲"; }
th[aria-sort="descending"]::after { content: " ▼"; }
#detail h3 { font-size: 0.9em; text-transform: uppercase; opacity: 0.8; }
pre.raw { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); }
`

/**
 * The page's script. **It never builds markup**: it toggles `hidden`, a class
 * and ARIA attributes, moves existing rows with `append`, and opens and closes
 * the one dialog. The filter and the sort are board-filter.ts's own functions,
 * embedded by their source, so the page runs what the tests prove.
 */
const SCRIPT = `const visibleIds = (${visibleIds.toString()});
const orderedIds = (${orderedIds.toString()});
const hiddenClosed = (${hiddenClosed.toString()});
// -- page --
const vscode = acquireVsCodeApi();
document.querySelectorAll('nav [data-tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('nav [data-tab]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  document.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== b.dataset.tab; });
}));
const dialog = document.getElementById('detail');
document.querySelectorAll('[data-open]').forEach((c) => c.addEventListener('click', () => {
  document.querySelectorAll('[data-detail]').forEach((d) => { d.hidden = d.dataset.detail !== c.dataset.open; });
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}));
document.getElementById('close-detail').addEventListener('click', () => dialog.close());
document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
const tbody = document.querySelector('table.backlog tbody');
const rows = [...document.querySelectorAll('tr[data-row]')];
const data = rows.map((r) => ({ id: r.dataset.row, parent: r.dataset.parent || undefined, type: r.dataset.type,
  state: r.dataset.state, tags: r.dataset.tags ? r.dataset.tags.split('\\u001f') : [], title: r.dataset.title,
  priority: r.dataset.priority || '' }));
const field = (id) => document.getElementById(id);
// Each field's value buttons: off, include, exclude (story nmf.4).
const fieldOf = (name) => {
  const f = { include: [], exclude: [], all: false };
  document.querySelectorAll('[data-field="' + name + '"] [data-value]').forEach((b) => {
    if (b.dataset.mode === 'include') f.include.push(b.dataset.value);
    if (b.dataset.mode === 'exclude') f.exclude.push(b.dataset.value);
  });
  return f;
};
const filter = () => ({ text: field('f-text').value, type: fieldOf('type'), state: fieldOf('state'),
  tag: { ...fieldOf('tag'), all: field('tag-all').getAttribute('aria-pressed') === 'true' },
  showClosed: field('show-closed').checked });
const cardEls = [...document.querySelectorAll('[data-card]')];
const cardRows = cardEls.map((c) => ({ id: c.dataset.card, parent: undefined, type: c.dataset.type, state: c.dataset.state,
  tags: c.dataset.tags ? c.dataset.tags.split('\\u001f') : [], title: c.dataset.title, priority: c.dataset.priority || '' }));
const expanded = (id) => { const t = document.querySelector('[data-toggle="' + CSS.escape(id) + '"]'); return !t || t.getAttribute('aria-expanded') === 'true'; };
const parentOf = new Map(data.map((d) => [d.id, d.parent]));
const underCollapsed = (id) => { for (let p = parentOf.get(id); p; p = parentOf.get(p)) { if (!expanded(p)) return true; } return false; };
const relayout = () => {
  const f = filter();
  const chosen = (x) => x.include.length > 0 || x.exclude.length > 0;
  const active = f.text.trim() !== '' || chosen(f.type) || chosen(f.state) || chosen(f.tag);
  const v = visibleIds(data, f);
  if (active) v.context.forEach((id) => { const t = document.querySelector('[data-toggle="' + CSS.escape(id) + '"]'); if (t) t.setAttribute('aria-expanded', 'true'); });
  let any = false;
  rows.forEach((r) => {
    const hide = !v.shown.has(r.dataset.row) || underCollapsed(r.dataset.row);
    r.hidden = hide; r.classList.toggle('context', v.context.has(r.dataset.row));
    if (!hide) any = true;
  });
  field('no-match').hidden = any;
  // The board's cards, by the same function (story nmf.4).
  const onCards = visibleIds(cardRows, f);
  cardEls.forEach((c) => { c.hidden = !onCards.shown.has(c.dataset.card); });
  // Closed work out of the way (story nmf.1): the board's Closed column follows
  // the toggle, and each view says how many closed items it is not showing.
  // Every view's done column (All items calls it Closed), and a lane whose
  // epic is closed once nothing open is left in it (story nmf.2).
  document.querySelectorAll('[data-column="closed"], [data-column="done"]').forEach((c) => { c.hidden = !f.showClosed; });
  document.querySelectorAll('section.lane').forEach((l) => {
    const open = l.querySelector('[data-column]:not([data-column="done"]) [data-card]:not([hidden])');
    l.hidden = (l.dataset.laneClosed === 'true' && !f.showClosed && !open) || (active && !l.querySelector('[data-card]:not([hidden])'));
  });
  const say = (n) => n === 0 ? '' : n + ' closed ' + (n === 1 ? 'item' : 'items') + ' hidden. Turn on Show closed to see ' + (n === 1 ? 'it' : 'them') + '.';
  const shownBoard = document.querySelector('[data-board]:not([hidden])');
  const onBoard = !shownBoard ? 0 : hiddenClosed(cardRows.filter((r) => shownBoard.querySelector('[data-card="' + CSS.escape(r.id) + '"]')), f);
  document.querySelectorAll('[data-view="board"] .hidden-closed').forEach((p) => { p.textContent = say(onBoard); p.hidden = onBoard === 0; });
  const inBacklog = hiddenClosed(data, f);
  document.querySelectorAll('[data-view="backlog"] .hidden-closed').forEach((p) => { p.textContent = say(inBacklog); p.hidden = inBacklog === 0; });
};
field('f-text').addEventListener('input', relayout);
const next = { '': 'include', include: 'exclude', exclude: '' };
document.querySelectorAll('[data-value]').forEach((b) => b.addEventListener('click', () => { b.dataset.mode = next[b.dataset.mode || '']; relayout(); }));
field('tag-all').addEventListener('click', () => {
  field('tag-all').setAttribute('aria-pressed', String(field('tag-all').getAttribute('aria-pressed') !== 'true')); relayout();
});
field('show-closed').addEventListener('change', relayout);
document.querySelectorAll('[data-board-view]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-board-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  document.querySelectorAll('[data-board]').forEach((v) => { v.hidden = v.dataset.board !== b.dataset.boardView; });
  vscode.postMessage({ type: 'view', view: b.dataset.boardView });
  relayout();
}));
document.querySelectorAll('[data-toggle]').forEach((t) => t.addEventListener('click', () => {
  t.setAttribute('aria-expanded', String(t.getAttribute('aria-expanded') !== 'true')); relayout();
}));
const all = (open) => { document.querySelectorAll('[data-toggle]').forEach((t) => t.setAttribute('aria-expanded', String(open))); relayout(); };
field('expand-all').addEventListener('click', () => all(true));
field('collapse-all').addEventListener('click', () => all(false));
document.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
  const dir = th.getAttribute('aria-sort') === 'ascending' ? 'desc' : 'asc';
  document.querySelectorAll('th[data-sort]').forEach((x) => x.setAttribute('aria-sort', 'none'));
  th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
  const byId = new Map(rows.map((r) => [r.dataset.row, r]));
  orderedIds(data, th.dataset.sort, dir).forEach((id) => tbody.append(byId.get(id)));
  tbody.append(field('no-match'));
}));
relayout();
`

/** A page with this extension's policy: shared by the board and the Study view. */
export function shell(nonce: string, body: string, script: string, style: string = STYLE): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP(nonce)}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style nonce="${nonce}">${style}</style>`,
    '</head><body>',
    body,
    script === '' ? '' : `<script nonce="${nonce}">${script}</script>`,
    '</body></html>',
  ].join('\n')
}

const isProposal = (item: Item) => item.labels.includes('proposed')

/** Stored state in words, as Azure DevOps shows it; a proposal says so instead. */
function stateOf(item: Item): string {
  if (isProposal(item)) return 'Proposal'
  const s = item.status.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The tags shown: a proposal's, then the item's own labels, the debt kind among them. */
function tags(item: Item): string {
  const shown = [...(isProposal(item) ? ['Proposal'] : []), ...item.labels.filter((l) => l !== 'proposed')]
  return shown.map((t) => `<span class="tag">${escape(t)}</span>`).join('')
}

/** The colour, the type's name and the ID, as the head of a card, a row and a form. */
function head(item: Item): string {
  const look = typeLook(item.type)
  return `<span class="type">${escape(look.name)}</span><span class="id">${escape(item.id)}</span>`
}

/**
 * The type's colour, as a class rather than a style attribute: the policy's
 * style-src allows only the page's own stylesheet, and an inline style="" is
 * dropped by the webview without a word.
 */
const KNOWN_TYPES = ['epic', 'feature', 'task', 'bug']
const typeClass = (item: Item) => `type-${KNOWN_TYPES.includes(item.type) ? item.type : 'other'}`
const MAX_DEPTH = 6

/** What every card and row is drawn with: the chain's marks and the remote PR links point at. */
interface Context {
  marks: ReadonlyMap<string, ChainMark>
  remote: string | undefined
}

/** Where the item stands in the chain (story nmf.3), and its priority. */
function marks(item: Item, ctx: Context): string {
  const m = ctx.marks.get(item.id)
  return (m?.awaitingVerification ? '<span class="mark">Awaiting verification</span>' : '') +
    (m?.ready ? '<span class="mark">Ready</span>' : '') +
    (m?.noCriterion ? '<span class="mark warn">no done criterion</span>' : '') +
    (item.priority === undefined ? '' : `<span class="prio">P${item.priority}</span>`)
}

/** The task's pull request, outside any button: an anchor inside one is invalid and would open the dialog. */
function pr(item: Item, ctx: Context): string {
  const link = prLink(ctx.remote, item.metadata?.['pr'])
  if (link === undefined) return ''
  return link.href === undefined
    ? `<span class="pr">${escape(link.text)}</span>`
    : `<a class="pr" href="${escape(link.href)}">${escape(link.text)}</a>`
}

function card(item: Item, ctx: Context): string {
  const proposed = isProposal(item) ? ' proposed' : ''
  const button = `<button class="card ${typeClass(item)}${proposed}" data-open="${escape(item.id)}">${head(item)}` +
    `<span class="title">${escape(item.title)}</span><span class="meta">${escape(stateOf(item))}</span>${marks(item, ctx)}${tags(item)}</button>`
  // The wrapper carries what the filter reads, as a backlog row does (story nmf.4).
  return `<div class="card-wrap" data-card="${escape(item.id)}" data-type="${escape(typeLook(item.type).name)}" ` +
    `data-state="${escape(stateOf(item))}" data-tags="${escape(shownTags(item).join('\u001f'))}" ` +
    `data-title="${escape(item.title)}" data-priority="${item.priority ?? ''}">${button}${pr(item, ctx)}</div>`
}

/** The tags shown and filtered on: a proposal says so, and the stored label is not shown twice. */
function shownTags(item: Item): string[] {
  return [...(isProposal(item) ? ['Proposal'] : []), ...item.labels.filter((l) => l !== 'proposed')]
}

/**
 * One filter for both tabs (story nmf.4): the keyword box, and each field's
 * values as buttons that cycle off, include, exclude. Tags can require all of
 * the included ones. Buttons, not inputs: they filter the page and send nothing.
 */
function filterBar(items: readonly Item[]): string {
  const values = (name: string, label: string, list: Iterable<string>, extra = '') =>
    `<div class="field" data-field="${name}"><span class="label">${label}</span>` +
    [...new Set(list)].sort().map((v) => `<button class="value" data-value="${escape(v)}" data-mode="">${escape(v)}</button>`).join('') +
    extra + '</div>'
  return '<div class="filters">' +
    '<input id="f-text" type="search" placeholder="Filter by ID or title" aria-label="Filter by ID or title">' +
    values('type', 'Type', items.map((i) => typeLook(i.type).name)) +
    values('state', 'State', items.map(stateOf)) +
    values('tag', 'Tags', items.flatMap(shownTags), '<button id="tag-all" aria-pressed="false">All of</button>') +
    '</div>'
}

function backlog(items: readonly Item[], ctx: Context): string {
  const body = backlogRows(items)
    .map(({ item, depth, hasChildren }) => {
      const toggle = hasChildren
        ? `<button class="toggle" data-toggle="${escape(item.id)}" aria-expanded="true" aria-label="Expand or collapse">▾</button>`
        : '<span class="toggle"></span>'
      return `<tr data-row="${escape(item.id)}" data-parent="${escape(item.parent ?? '')}" ` +
        `data-type="${escape(typeLook(item.type).name)}" data-state="${escape(stateOf(item))}" ` +
        `data-tags="${escape(shownTags(item).join('\u001f'))}" data-title="${escape(item.title)}" data-priority="${item.priority ?? ''}">` +
        `<td>${escape(item.id)}</td>` +
        `<td class="title-cell ${typeClass(item)} depth-${Math.min(depth, MAX_DEPTH)}">${toggle}` +
        `<button class="link" data-open="${escape(item.id)}"><span class="type">${escape(typeLook(item.type).name)}</span>${escape(item.title)}</button>` +
        `${marks({ ...item, priority: undefined }, ctx)}${pr(item, ctx)}</td>` +
        `<td>${item.priority === undefined ? '' : `P${item.priority}`}</td><td>${escape(stateOf(item))}</td><td>${tags(item)}</td></tr>`
    })
    .join('')
  const th = (key: string, label: string) => `<th data-sort="${key}" aria-sort="none">${label}</th>`
  return '<p><button id="expand-all">Expand all</button> <button id="collapse-all">Collapse all</button></p>' +
    `<table class="backlog"><thead><tr>${th('id', 'ID')}${th('title', 'Title')}${th('priority', 'Priority')}${th('state', 'State')}${th('tags', 'Tags')}</tr></thead>` +
    `<tbody>${body}<tr id="no-match" hidden><td colspan="5">No items match this filter.</td></tr></tbody></table>`
}

const FIELDS: ReadonlyArray<{ key: keyof Rendered; title: string }> = [
  { key: 'description', title: 'Description' },
  { key: 'acceptance', title: 'Acceptance criteria' },
  { key: 'design', title: 'Design' },
  { key: 'closeReason', title: 'Why it was closed' },
]

function links(title: string, items: readonly Item[]): string {
  if (items.length === 0) return ''
  return `<h3>${title}</h3><ul class="links">${items
    .map((i) => `<li><button class="link" data-open="${escape(i.id)}">${head(i)} ${escape(i.title)}</button></li>`)
    .join('')}</ul>`
}

function form(item: Item, rendered: Rendered | undefined, byId: ReadonlyMap<string, Item>, children: readonly Item[]): string {
  const parts = FIELDS.flatMap(({ key, title }) => {
    const raw = item[key]
    if (raw === undefined) return []
    const html = rendered?.[key]
    const body = html === undefined ? `<pre class="raw">${escape(raw)}</pre>` : html
    return [`<h3>${title}</h3><div>${body}</div>`]
  })
  const parent = item.parent === undefined ? undefined : byId.get(item.parent)
  return `<section data-detail="${escape(item.id)}" class="card ${typeClass(item)}" hidden>` +
    `<p>${head(item)}</p><h2>${escape(item.title)}</h2>` +
    `<p class="meta">State: ${escape(stateOf(item))} ${tags(item)}</p>` +
    (parts.join('') || '<p>No text.</p>') +
    links('Parent', parent === undefined ? [] : [parent]) +
    links('Children', children) +
    '</section>'
}

export function boardPage(input: {
  nonce: string
  items: readonly Item[]
  rendered: ReadonlyMap<string, Rendered>
  notice?: string
  /** The board view to open on (story nmf.2); All items when not given. */
  view?: ViewName
  /** The project's origin remote, which a task's PR link is built from (story nmf.3). */
  remote?: string
}): string {
  const { nonce, items, rendered, notice } = input
  const ctx: Context = { marks: chainMarks(items), remote: input.remote }
  const active = input.view ?? 'all'
  const picker = '<p class="views">' + VIEWS
    .map((v) => `<button data-board-view="${v.name}" aria-pressed="${v.name === active}">${escape(v.title)}</button>`)
    .join(' ') + '</p>'
  const board = picker + VIEWS.map(({ name }) => {
    const lanes = boardView(items, name).lanes.map((lane) => {
      const cols = lane.columns
        .map((c) => `<div class="column" data-column="${c.key}"><h2>${escape(c.title)} (${c.items.length})</h2>${c.items.map((i) => card(i, ctx)).join('')}</div>`)
        .join('')
      return lane.title === ''
        ? `<div class="columns">${cols}</div>`
        : `<section class="lane" data-lane="${escape(lane.key)}" data-lane-closed="${lane.closed}"><h3>${escape(lane.title)}</h3><div class="columns">${cols}</div></section>`
    }).join('')
    return `<div data-board="${name}"${name === active ? '' : ' hidden'}>${lanes}</div>`
  }).join('')
  const byId = new Map(items.map((i) => [i.id, i]))
  const childrenOf = (id: string) => items.filter((i) => i.parent === id)
  const body = [
    notice === undefined ? '' : `<p class="notice">${escape(notice)}</p>`,
    '<nav>',
    '<button data-tab="board" aria-pressed="true">Board</button>',
    '<button data-tab="backlog" aria-pressed="false">Backlog</button>',
    '<label class="toggle-closed"><input type="checkbox" id="show-closed"> Show closed</label>',
    '<span class="spacer"></span>',
    '<button id="refresh">Read again</button>',
    '</nav>',
    filterBar(items),
    `<div data-view="board"><p class="hidden-closed" hidden></p>${board}</div>`,
    `<div data-view="backlog" hidden><p class="hidden-closed" hidden></p>${backlog(items, ctx)}</div>`,
    `<dialog id="detail" aria-label="Work item"><button id="close-detail" aria-label="Close">✕</button>` +
      `${items.map((i) => form(i, rendered.get(i.id), byId, childrenOf(i.id))).join('')}</dialog>`,
  ].join('\n')
  return shell(nonce, body, SCRIPT)
}

/** A page that only says something: no tracker, a stopped container, a failed read. */
export function messagePage(input: { nonce: string; title: string; body: string }): string {
  const script = `const vscode = acquireVsCodeApi();
document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));`
  return shell(
    input.nonce,
    `<h1>${escape(input.title)}</h1><p>${escape(input.body)}</p><nav><button id="refresh">Read again</button></nav>`,
    script,
  )
}
