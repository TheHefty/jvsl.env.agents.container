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
import { orderedIds, visibleIds } from './board-filter.ts'
import { backlogRows, columns, typeLook, type Item } from './board-read.ts'

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
  state: r.dataset.state, tags: r.dataset.tags ? r.dataset.tags.split('\\u001f') : [], title: r.dataset.title }));
const field = (id) => document.getElementById(id);
const filter = () => ({ text: field('f-text').value, type: field('f-type').value, state: field('f-state').value, tag: field('f-tag').value });
const expanded = (id) => { const t = document.querySelector('[data-toggle="' + CSS.escape(id) + '"]'); return !t || t.getAttribute('aria-expanded') === 'true'; };
const parentOf = new Map(data.map((d) => [d.id, d.parent]));
const underCollapsed = (id) => { for (let p = parentOf.get(id); p; p = parentOf.get(p)) { if (!expanded(p)) return true; } return false; };
const relayout = () => {
  const f = filter();
  const active = f.text.trim() !== '' || f.type !== '' || f.state !== '' || f.tag !== '';
  const v = visibleIds(data, f);
  if (active) v.context.forEach((id) => { const t = document.querySelector('[data-toggle="' + CSS.escape(id) + '"]'); if (t) t.setAttribute('aria-expanded', 'true'); });
  let any = false;
  rows.forEach((r) => {
    const hide = !v.shown.has(r.dataset.row) || underCollapsed(r.dataset.row);
    r.hidden = hide; r.classList.toggle('context', v.context.has(r.dataset.row));
    if (!hide) any = true;
  });
  field('no-match').hidden = any;
};
['f-text', 'f-type', 'f-state', 'f-tag'].forEach((id) => field(id).addEventListener('input', relayout));
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
`

function shell(nonce: string, body: string, script: string): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP(nonce)}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style nonce="${nonce}">${STYLE}</style>`,
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

function card(item: Item): string {
  const proposed = isProposal(item) ? ' proposed' : ''
  return `<button class="card ${typeClass(item)}${proposed}" data-open="${escape(item.id)}">${head(item)}` +
    `<span class="title">${escape(item.title)}</span><span class="meta">${escape(stateOf(item))}</span>${tags(item)}</button>`
}

function backlog(items: readonly Item[]): string {
  const body = backlogRows(items)
    .map(({ item, depth, hasChildren }) => {
      const toggle = hasChildren
        ? `<button class="toggle" data-toggle="${escape(item.id)}" aria-expanded="true" aria-label="Expand or collapse">▾</button>`
        : '<span class="toggle"></span>'
      const shownTags = [...(isProposal(item) ? ['Proposal'] : []), ...item.labels.filter((l) => l !== 'proposed')]
      return `<tr data-row="${escape(item.id)}" data-parent="${escape(item.parent ?? '')}" ` +
        `data-type="${escape(typeLook(item.type).name)}" data-state="${escape(stateOf(item))}" ` +
        `data-tags="${escape(shownTags.join('\u001f'))}" data-title="${escape(item.title)}">` +
        `<td>${escape(item.id)}</td>` +
        `<td class="title-cell ${typeClass(item)} depth-${Math.min(depth, MAX_DEPTH)}">${toggle}` +
        `<button class="link" data-open="${escape(item.id)}"><span class="type">${escape(typeLook(item.type).name)}</span>${escape(item.title)}</button></td>` +
        `<td>${escape(stateOf(item))}</td><td>${tags(item)}</td></tr>`
    })
    .join('')
  const options = (values: Iterable<string>) =>
    [...new Set(values)].sort().map((v) => `<option value="${escape(v)}">${escape(v)}</option>`).join('')
  const filters = '<div class="filters">' +
    '<input id="f-text" type="search" placeholder="Filter by ID or title" aria-label="Filter by ID or title">' +
    `<select id="f-type" aria-label="Type"><option value="">Any type</option>${options(items.map((i) => typeLook(i.type).name))}</select>` +
    `<select id="f-state" aria-label="State"><option value="">Any state</option>${options(items.map(stateOf))}</select>` +
    `<select id="f-tag" aria-label="Tag"><option value="">Any tag</option>${options(items.flatMap((i) => [...(isProposal(i) ? ['Proposal'] : []), ...i.labels.filter((l) => l !== 'proposed')]))}</select>` +
    '</div>'
  const th = (key: string, label: string) => `<th data-sort="${key}" aria-sort="none">${label}</th>`
  return filters + '<p><button id="expand-all">Expand all</button> <button id="collapse-all">Collapse all</button></p>' +
    `<table class="backlog"><thead><tr>${th('id', 'ID')}${th('title', 'Title')}${th('state', 'State')}${th('tags', 'Tags')}</tr></thead>` +
    `<tbody>${body}<tr id="no-match" hidden><td colspan="4">No items match this filter.</td></tr></tbody></table>`
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
}): string {
  const { nonce, items, rendered, notice } = input
  const board = columns(items)
    .map((c) => `<div class="column"><h2>${escape(c.title)} (${c.items.length})</h2>${c.items.map(card).join('')}</div>`)
    .join('')
  const byId = new Map(items.map((i) => [i.id, i]))
  const childrenOf = (id: string) => items.filter((i) => i.parent === id)
  const body = [
    notice === undefined ? '' : `<p class="notice">${escape(notice)}</p>`,
    '<nav>',
    '<button data-tab="board" aria-pressed="true">Board</button>',
    '<button data-tab="backlog" aria-pressed="false">Backlog</button>',
    '<span class="spacer"></span>',
    '<button id="refresh">Read again</button>',
    '</nav>',
    `<div data-view="board" class="columns">${board}</div>`,
    `<div data-view="backlog" hidden>${backlog(items)}</div>`,
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
