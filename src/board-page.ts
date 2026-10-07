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
#detail { border-top: 1px solid var(--vscode-panel-border); margin-top: 16px; padding-top: 8px; }
#detail h3 { font-size: 0.9em; text-transform: uppercase; opacity: 0.8; }
pre.raw { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); }
`

const SCRIPT = `
const vscode = acquireVsCodeApi();
document.querySelectorAll('nav [data-tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('nav [data-tab]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  document.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== b.dataset.tab; });
}));
document.querySelectorAll('[data-open]').forEach((c) => c.addEventListener('click', () => {
  document.querySelectorAll('[data-detail]').forEach((d) => { d.hidden = d.dataset.detail !== c.dataset.open; });
  document.getElementById('detail').hidden = false;
}));
document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
const rows = [...document.querySelectorAll('tr[data-row]')];
const expanded = (id) => { const t = document.querySelector('[data-toggle="' + CSS.escape(id) + '"]'); return !t || t.getAttribute('aria-expanded') === 'true'; };
const shown = (row) => { for (let p = row.dataset.parent; p; ) { if (!expanded(p)) return false; const up = document.querySelector('tr[data-row="' + CSS.escape(p) + '"]'); p = up ? up.dataset.parent : ''; } return true; };
const relayout = () => rows.forEach((r) => { r.hidden = !shown(r); });
document.querySelectorAll('[data-toggle]').forEach((t) => t.addEventListener('click', () => {
  t.setAttribute('aria-expanded', String(t.getAttribute('aria-expanded') !== 'true')); relayout();
}));
const all = (open) => { document.querySelectorAll('[data-toggle]').forEach((t) => t.setAttribute('aria-expanded', String(open))); relayout(); };
document.getElementById('expand-all').addEventListener('click', () => all(true));
document.getElementById('collapse-all').addEventListener('click', () => all(false));
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
      return `<tr data-row="${escape(item.id)}" data-parent="${escape(item.parent ?? '')}">` +
        `<td>${escape(item.id)}</td>` +
        `<td class="title-cell ${typeClass(item)} depth-${Math.min(depth, MAX_DEPTH)}">${toggle}` +
        `<button class="link" data-open="${escape(item.id)}"><span class="type">${escape(typeLook(item.type).name)}</span>${escape(item.title)}</button></td>` +
        `<td>${escape(stateOf(item))}</td><td>${tags(item)}</td></tr>`
    })
    .join('')
  return '<p><button id="expand-all">Expand all</button> <button id="collapse-all">Collapse all</button></p>' +
    `<table class="backlog"><thead><tr><th>ID</th><th>Title</th><th>State</th><th>Tags</th></tr></thead><tbody>${body}</tbody></table>`
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
    `<div id="detail" hidden>${items.map((i) => form(i, rendered.get(i.id), byId, childrenOf(i.id))).join('')}</div>`,
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
