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
import { columns, tree, type Item, type Node } from './board-read.ts'

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

function badges(item: Item): string {
  const kind = item.debtKind === undefined ? '' : `<span class="kind">${escape(item.debtKind)}</span>`
  return `<span class="id">${escape(item.id)}</span>${kind}`
}

function card(item: Item): string {
  const proposed = item.labels.includes('proposed') ? ' proposed' : ''
  return `<button class="card${proposed}" data-open="${escape(item.id)}">${badges(item)}${escape(item.title)}</button>`
}

function branch(nodes: readonly Node[]): string {
  if (nodes.length === 0) return ''
  return `<ul class="tree">${nodes
    .map((n) => {
      const state = n.item.labels.includes('proposed') ? 'proposal' : n.item.status.replace('_', ' ')
      return `<li><button class="card${n.item.labels.includes('proposed') ? ' proposed' : ''}" data-open="${escape(n.item.id)}">` +
        `<span class="state">${escape(state)}</span>${badges(n.item)}${escape(n.item.title)}</button>${branch(n.children)}</li>`
    })
    .join('')}</ul>`
}

const FIELDS: ReadonlyArray<{ key: keyof Rendered; title: string }> = [
  { key: 'description', title: 'Description' },
  { key: 'acceptance', title: 'Acceptance criteria' },
  { key: 'design', title: 'Design' },
  { key: 'closeReason', title: 'Why it was closed' },
]

function detail(item: Item, rendered: Rendered | undefined): string {
  const parts = FIELDS.flatMap(({ key, title }) => {
    const raw = item[key]
    if (raw === undefined) return []
    const html = rendered?.[key]
    const body = html === undefined ? `<pre class="raw">${escape(raw)}</pre>` : html
    return [`<h3>${title}</h3><div>${body}</div>`]
  })
  return `<section data-detail="${escape(item.id)}" hidden><h2>${badges(item)}${escape(item.title)}</h2>${
    parts.join('') || '<p>No text.</p>'
  }</section>`
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
  const body = [
    notice === undefined ? '' : `<p class="notice">${escape(notice)}</p>`,
    '<nav>',
    '<button data-tab="board" aria-pressed="true">Board</button>',
    '<button data-tab="tree" aria-pressed="false">Tree</button>',
    '<span class="spacer"></span>',
    '<button id="refresh">Read again</button>',
    '</nav>',
    `<div data-view="board" class="columns">${board}</div>`,
    `<div data-view="tree" hidden>${branch(tree(items))}</div>`,
    `<div id="detail" hidden>${items.map((i) => detail(i, rendered.get(i.id))).join('')}</div>`,
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
