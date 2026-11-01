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
 * hidden until opened. The page asks only to read again, to remember a view and
 * to copy an ID. Nothing on it changes the tracker (FR-118).
 */
import { hiddenClosed, orderedIds, visibleIds } from './board-filter.ts'
import { backlogRows, typeLook, type Item } from './board-read.ts'
import { parseGherkin } from './board-gherkin.ts'
import { boardView, chainMarks, laneIsQuiet, laneSummary, taskMeta, VIEWS, type ChainMark, type Lane, type ViewColumn, type ViewName } from './board-view.ts'
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
body { font-family: var(--vscode-font-family); font-size: 13px; line-height: 1.4; color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 0; }
a { color: var(--vscode-textLink-foreground); }
button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
.icon { width: 14px; height: 14px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linejoin: round; stroke-linecap: round; }
.card .icon, .lane-head .type-icon { color: var(--type-colour); }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--vscode-panel-border); }
.bar .spacer { flex: 1; }
nav { display: inline-flex; border: 1px solid var(--vscode-panel-border); border-radius: 4px; overflow: hidden; }
.seg { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.seg + .seg { border-left: 1px solid var(--vscode-panel-border); }
.seg:hover { background: var(--vscode-list-hoverBackground); }
.seg[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.group-by, .toggle-closed { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
.group-by select { height: 28px; padding: 0 8px; border-radius: 4px; font: inherit; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border)); }
.search { display: inline-flex; align-items: center; gap: 8px; height: 28px; width: 280px; max-width: 100%; box-sizing: border-box; padding: 0 8px; border-radius: 4px;
  color: var(--vscode-descriptionForeground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); }
.search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font: inherit; font-size: 12px; color: var(--vscode-input-foreground); }
.iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 0; border-radius: 4px; background: none; color: inherit; cursor: pointer; }
.iconbtn:hover { background: var(--vscode-list-hoverBackground); }
.view { padding: 0 20px 32px; }
.notice { margin: 0; padding: 10px 20px; }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 20px; border-bottom: 1px solid var(--vscode-panel-border); }
.filters .spacer { flex: 1; }
.filter { position: relative; }
.filt { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 4px; border: 1px solid var(--vscode-panel-border); background: none; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
.filt:hover { background: var(--vscode-list-hoverBackground); }
.filt .icon { width: 10px; height: 10px; stroke-width: 2; }
.filt[aria-expanded="true"] .icon { transform: rotate(180deg); }
.filt-included { color: var(--vscode-descriptionForeground); }
.filt-excluded { text-decoration: line-through; }
.filt.on-include { border-color: var(--vscode-button-background); background: color-mix(in srgb, var(--vscode-button-background) 25%, transparent); }
.filt.on-include .filt-included { color: inherit; }
.filt.on-exclude { border-color: var(--vscode-errorForeground); background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent); }
.filt.on-exclude .filt-not, .filt.on-exclude .filt-excluded { color: var(--vscode-errorForeground); }
.popover { position: absolute; left: 0; top: 34px; z-index: 2; width: 320px; box-sizing: border-box; padding: 6px 0; border-radius: 6px; color: var(--vscode-foreground); background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border)); box-shadow: 0 8px 24px var(--vscode-widget-shadow); max-height: 320px; overflow-y: auto; }
.pop-note { margin: 0; padding: 6px 12px 8px; font-size: 11px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
.pop-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px 4px 12px; }
.pop-row .icon { color: var(--type-colour); }
.pop-name { flex: 1; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; }
.pop-row[data-mode="exclude"] { background: color-mix(in srgb, var(--vscode-errorForeground) 6%, transparent); }
.pop-row[data-mode="exclude"] .pop-name { text-decoration: line-through; color: var(--vscode-descriptionForeground); }
.tri-group { display: inline-flex; flex: none; border: 1px solid var(--vscode-panel-border); border-radius: 4px; overflow: hidden; }
.tri { height: 24px; padding: 0 8px; border: 0; background: none; color: var(--vscode-descriptionForeground); font: inherit; font-size: 11px; cursor: pointer; }
.tri + .tri { border-left: 1px solid var(--vscode-panel-border); }
.tri:hover { background: var(--vscode-list-hoverBackground); }
.tri[data-set="include"][aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.tri[data-set="exclude"][aria-pressed="true"] { background: color-mix(in srgb, var(--vscode-errorForeground) 22%, transparent); color: var(--vscode-foreground); }
.pop-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 4px; padding: 8px 12px 4px; font-size: 11px; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--vscode-panel-border); }
#tag-all { height: 22px; padding: 0 8px; border-radius: 4px; border: 1px solid var(--vscode-panel-border); background: none; color: inherit; font: inherit; cursor: pointer; }
#tag-all[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
#filter-count { font-size: 12px; color: var(--vscode-descriptionForeground); margin-left: 4px; }
#closed-count { color: var(--vscode-descriptionForeground); }
.toggle-closed { cursor: pointer; color: inherit; }
kbd { font: inherit; font-size: 11px; color: var(--vscode-descriptionForeground); border: 1px solid var(--vscode-panel-border); border-radius: 3px; padding: 0 5px; }
.board-grid { min-width: 840px; }
${[5, 6, 7, 8].map((n) => `.board-grid.cols-${n} { min-width: ${n * 200}px; }`).join('\n')}
.col-titles, .columns { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 12px; }
.col-titles { position: sticky; top: 0; z-index: 1; padding: 14px 0 10px; background: var(--vscode-editor-background); }
.col-title { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.col-title .count { font-weight: 400; color: var(--vscode-descriptionForeground); }
.dot { width: 8px; height: 8px; box-sizing: border-box; border-radius: 50%; background: var(--state-colour, transparent); border: 1.5px solid var(--state-colour, var(--vscode-descriptionForeground)); }
.lane { border-top: 1px solid var(--vscode-panel-border); padding: 10px 0 14px; }
.lane-head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 4px 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.lane-head .chevron { width: 12px; height: 12px; stroke-width: 2; color: var(--vscode-descriptionForeground); }
.lane-head[aria-expanded="false"] .chevron { transform: rotate(-90deg); }
.lane-head[aria-expanded="false"] + .columns { display: none; }
.lane-title { font-weight: 600; }
.lane-summary { margin-left: auto; font-size: 12px; color: var(--vscode-descriptionForeground); }
.lane .columns { margin-top: 8px; }
.column { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.empty { display: none; height: 44px; border: 1px dashed var(--vscode-panel-border); border-radius: 6px; }
.column:not(:has(.card-wrap:not([hidden]))) > .empty { display: block; }
.card-wrap { display: grid; gap: 4px; }
.card { display: flex; flex-direction: column; gap: 6px; width: 100%; box-sizing: border-box; text-align: left; padding: 10px 12px; font: inherit; color: inherit; cursor: pointer;
  background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
.card:hover { background: var(--vscode-list-hoverBackground); }
.card.proposed { border-style: dashed; border-color: var(--vscode-focusBorder); }
.card-head { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--vscode-descriptionForeground); }
.card-head .icon { width: 13px; height: 13px; }
.card-head .prio { margin-left: auto; }
.clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11px; }
.foot:empty { display: none; }
.pill { padding: 1px 8px; border-radius: 10px; font-size: 11px; border: 1px solid var(--state-colour, var(--vscode-panel-border)); color: var(--state-colour, inherit); }
.tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.mark { padding: 1px 6px; border-radius: 3px; font-size: 11px; border: 1px solid var(--vscode-panel-border); }
.mark.warn { border-color: var(--vscode-editorWarning-foreground); }
.task-meta { display: inline-flex; align-items: center; gap: 4px; color: var(--vscode-descriptionForeground); }
.task-meta .icon { width: 11px; height: 11px; }
.id { font-family: var(--vscode-editor-font-family); font-size: 11px; color: var(--vscode-descriptionForeground); }
.pr { font-size: 0.8em; margin-left: 6px; }
.kind, .state { font-size: 0.8em; opacity: 0.75; margin-right: 6px; }
.kind { color: var(--vscode-errorForeground); opacity: 1; }
.type { font-size: 11px; }
.title { display: block; margin: 2px 0; }
.meta { font-size: 0.8em; opacity: 0.85; }
ul.tree { list-style: none; padding-left: 16px; }
ul.tree > li { margin: 2px 0; }
[hidden] { display: none !important; }
table.backlog { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 860px; table-layout: fixed; border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin-top: 14px; }
table.backlog th, table.backlog td { text-align: left; height: 36px; box-sizing: border-box; padding: 0 12px; border-bottom: 1px solid var(--vscode-panel-border); }
table.backlog th { height: 32px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; background: var(--vscode-editorWidget-background); }
table.backlog th:nth-child(2) { width: 190px; }
table.backlog th:nth-child(3) { width: 64px; }
table.backlog th:nth-child(4) { width: 150px; }
table.backlog tbody tr:hover { background: var(--vscode-list-hoverBackground); }
.item-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.item-cell .icon { color: var(--type-colour); }
.item-cell .id { flex: none; min-width: 44px; }
button.link.ttl { min-width: 0; color: inherit; text-align: left; font: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button.link.ttl:hover { text-decoration: underline; }
.type-epic > .item-line > .ttl { font-weight: 600; }
tr[data-state="Closed"] .ttl { color: var(--vscode-descriptionForeground); }
.hidden-count, .priority-cell { font-size: 11px; color: var(--vscode-descriptionForeground); }
.hidden-count { flex: none; }
.backlog-tools { display: inline-flex; gap: 2px; }
.chev { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 18px; height: 18px; padding: 0; border: 0; border-radius: 3px; background: none; color: var(--vscode-descriptionForeground); cursor: pointer; }
button.chev:hover { background: var(--vscode-list-hoverBackground); }
.chev .icon { width: 12px; height: 12px; stroke-width: 2; color: inherit; }
.chev[aria-expanded="false"] .icon { transform: rotate(-90deg); }
button.link { background: none; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; padding: 0; }
.links li { margin: 2px 0; }
.type-other { --type-colour: #8A8886; }
${['epic', 'feature', 'task', 'bug'].map((t) => `.type-${t} { --type-colour: ${typeLook(t).colour}; }`).join('\n')}
body.vscode-light .type-epic { --type-colour: #b36b00; }
body.vscode-light .type-feature { --type-colour: #0b6bb5; }
body.vscode-light .type-task { --type-colour: #2e7d32; }
body.vscode-light .type-bug { --type-colour: #c4432b; }
.state-in-progress { --state-colour: #4daafc; }
.state-awaiting { --state-colour: #e5c07b; }
.state-proposal { --state-colour: #c5a5f5; }
body.vscode-light .state-in-progress { --state-colour: #0b6bb5; }
body.vscode-light .state-awaiting { --state-colour: #8a6100; }
body.vscode-light .state-proposal { --state-colour: #6f42c1; }
${Array.from({ length: 7 }, (_, d) => `td.depth-${d} { padding-left: ${d * 22 + 12}px; }`).join('\n')}
dialog#detail { box-sizing: border-box; width: min(720px, 92vw); max-width: none; margin: 0 0 0 auto; height: 100vh; max-height: none; padding: 0; overflow: auto; line-height: 1.5;
  color: var(--vscode-foreground); background: var(--vscode-editorWidget-background); border: 0; border-left: 1px solid var(--vscode-panel-border); }
dialog#detail::backdrop { background: rgba(0, 0, 0, 0.45); }
.panel-nav { position: fixed; top: 10px; right: 12px; z-index: 2; display: inline-flex; gap: 2px; }
.panel-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 10px 100px 10px 20px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-panel-border); }
.panel-head .icon { color: var(--type-colour); }
.panel-head .type { font-size: 12px; color: var(--vscode-descriptionForeground); }
.panel-head .id { font-size: 12px; color: inherit; }
.panel-body { display: flex; flex-direction: column; gap: 24px; padding: 20px 24px 32px; }
.panel-title { margin: 0; font-size: 20px; line-height: 1.3; font-weight: 600; }
.fields { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 8px 12px; margin: -10px 0 0; font-size: 12px; }
.fields dt { color: var(--vscode-descriptionForeground); }
.fields dd { margin: 0; }
.stored { margin-left: 8px; color: var(--vscode-descriptionForeground); }
.panel-section { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.panel-section h2 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.panel-section .count { font-weight: 400; color: var(--vscode-descriptionForeground); }
.panel-section code { font-family: var(--vscode-editor-font-family); font-size: 12px; padding: 1px 5px; border-radius: 3px; background: var(--vscode-textCodeBlock-background); }
.gherkin-feature { margin: 0; }
.gherkin-key { color: var(--vscode-symbolIcon-keywordForeground, var(--vscode-textLink-foreground)); font-weight: 600; }
.scenario { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editor-background); }
.scenario-name { margin: 0; font-weight: 600; }
.step { display: grid; grid-template-columns: 52px minmax(0, 1fr); column-gap: 8px; }
.step .gherkin-key { text-align: right; font-family: var(--vscode-editor-font-family); font-size: 12px; font-weight: 400; }
.child { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 36px; padding: 0 10px; border: 0; border-radius: 4px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.child:hover { background: var(--vscode-list-hoverBackground); }
.child .icon { color: var(--type-colour); }
.child .id { flex: none; min-width: 40px; }
.child-title { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.child .pill { flex: none; }
tr.context { opacity: 0.5; }
th[data-sort] { cursor: pointer; user-select: none; }
th[aria-sort="ascending"]::after { content: " ▲"; }
th[aria-sort="descending"]::after { content: " ▼"; }
pre.raw { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); }
`

/** The design's icons, drawn in the page: the policy loads nothing. `currentColor`, so a type's colour reaches them. */
const svg = (paths: string, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${paths}</svg>`
const ICONS = {
  epic: svg('<path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z"></path>'),
  feature: svg('<path d="M4 2.5h8v11l-4-2.5-4 2.5z"></path>'),
  task: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="2"></rect><path d="m5.5 8 1.8 1.8 3.2-3.3"></path>'),
  bug: svg('<rect x="4.5" y="5" width="7" height="8.5" rx="3.5"></rect><path d="M6 5V3.5M10 5V3.5M2.5 8.5h2M11.5 8.5h2M3 12.5l1.6-1M13 12.5l-1.6-1"></path>'),
  other: svg('<circle cx="8" cy="8" r="4.5"></circle>'),
  chevron: svg('<path d="m4 6 4 4 4-4"></path>', 'icon chevron'),
  board: svg('<rect x="1.5" y="2.5" width="3.5" height="11" rx="1"></rect><rect x="6.25" y="2.5" width="3.5" height="7" rx="1"></rect><rect x="11" y="2.5" width="3.5" height="9" rx="1"></rect>'),
  backlog: svg('<path d="M5 4h9M5 8h9M7.5 12H14M2 4h.5M2 8h.5M4.5 12H5"></path>'),
  search: svg('<circle cx="7" cy="7" r="4.5"></circle><path d="m10.5 10.5 3.5 3.5"></path>'),
  expand: svg('<path d="m4.5 3 3.5 3.5L11.5 3M4.5 9.5 8 13l3.5-3.5"></path>'),
  collapse: svg('<path d="M4.5 6.5 8 3l3.5 3.5M4.5 13 8 9.5l3.5 3.5"></path>'),
  copy: svg('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"></rect><path d="M10.5 3.5v-1h-8v8h1"></path>'),
  up: svg('<path d="m4 10 4-4 4 4"></path>'),
  down: svg('<path d="m4 6 4 4 4-4"></path>'),
  close: svg('<path d="m4 4 8 8M12 4l-8 8"></path>'),
  refresh: svg('<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"></path>'),
}
const typeIcon = (type: string) => ICONS[type as 'epic' | 'feature' | 'task' | 'bug'] ?? ICONS.other

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
  document.querySelector('.group-by').hidden = b.dataset.tab !== 'board';
  document.querySelector('.backlog-tools').hidden = b.dataset.tab !== 'backlog';
  relayout();
}));
const dialog = document.getElementById('detail');
let current;
const showItem = (id) => {
  current = id;
  document.querySelectorAll('[data-detail]').forEach((d) => { d.hidden = d.dataset.detail !== id; });
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
};
document.querySelectorAll('[data-open]').forEach((c) => c.addEventListener('click', () => showItem(c.dataset.open)));
// Previous and next walk what the view has in sight (story dox.4): a card or row
// the filter hid, or a lane collapsed, takes no space, so it is never opened.
const inSight = () => [...document.querySelector('[data-view]:not([hidden])').querySelectorAll('[data-card], [data-row]')]
  .filter((el) => el.getClientRects().length > 0).map((el) => el.dataset.card || el.dataset.row);
const step = (by) => { const list = inSight(); const at = list.indexOf(current); if (at !== -1 && list[at + by]) showItem(list[at + by]); };
document.getElementById('prev-item').addEventListener('click', () => step(-1));
document.getElementById('next-item').addEventListener('click', () => step(1));
dialog.addEventListener('keydown', (e) => {
  if (e.key === 'j') step(1);
  if (e.key === 'k') step(-1);
});
document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
  vscode.postMessage({ type: 'copy', id: b.dataset.copy });
  b.title = 'Copied';
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
  tag: { ...fieldOf('tag'), all: field('tag-all').getAttribute('aria-pressed') === 'true' }, priority: fieldOf('priority'),
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
  const active = f.text.trim() !== '' || chosen(f.type) || chosen(f.state) || chosen(f.tag) || chosen(f.priority);
  const v = visibleIds(data, f);
  if (active) v.context.forEach((id) => { const t = document.querySelector('[data-toggle="' + CSS.escape(id) + '"]'); if (t) t.setAttribute('aria-expanded', 'true'); });
  let any = false;
  rows.forEach((r) => {
    const hide = !v.shown.has(r.dataset.row) || underCollapsed(r.dataset.row);
    r.hidden = hide; r.classList.toggle('context', v.context.has(r.dataset.row));
    if (!hide) any = true;
  });
  field('no-match').hidden = any;
  // What a collapsed parent hides: its descendants the filter keeps (story dox.2).
  document.querySelectorAll('[data-hidden-count]').forEach((el) => {
    const id = el.dataset.hiddenCount;
    const under = (d) => { for (let p = parentOf.get(d.id); p; p = parentOf.get(p)) { if (p === id) return true; } return false; };
    const n = expanded(id) ? 0 : data.filter((d) => v.shown.has(d.id) && under(d)).length;
    el.textContent = n === 0 ? '' : n + ' hidden';
    el.hidden = n === 0;
  });
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
  document.querySelectorAll('[data-col-count]').forEach((el) => {
    el.textContent = el.closest('[data-board]').querySelectorAll('.column[data-column="' + el.dataset.colCount + '"] [data-card]:not([hidden])').length;
  });
  const shownBoard = document.querySelector('[data-board]:not([hidden])');
  const onShownBoard = !shownBoard ? [] : cardRows.filter((r, i) => shownBoard.contains(cardEls[i]));
  const onBacklog = !document.querySelector('[data-view="backlog"]').hidden;
  // Each field's button says what it keeps, as text (story dox.3).
  document.querySelectorAll('.filter').forEach((el) => {
    const x = fieldOf(el.dataset.field);
    el.querySelector('.filt-included').textContent = x.include.join(', ') || (x.exclude.length > 0 ? '' : el.dataset.none);
    el.querySelector('.filt-not').hidden = x.exclude.length === 0;
    el.querySelector('.filt-excluded').textContent = x.exclude.join(', ');
    el.querySelector('.filt').classList.toggle('on-include', x.include.length > 0);
    el.querySelector('.filt').classList.toggle('on-exclude', x.exclude.length > 0);
  });
  const seen = (onBacklog ? data : onShownBoard).filter((r) => r.state !== 'Closed');
  const total = seen.length;
  const kept = seen.filter((r) => onBacklog ? v.shown.has(r.id) && !v.context.has(r.id) : onCards.shown.has(r.id)).length;
  field('filter-count').textContent = kept + ' of ' + total + ' open items';
  field('filter-count').hidden = !active;
  field('clear-filters').hidden = !active;
  const closedHidden = onBacklog ? hiddenClosed(data, f) : hiddenClosed(onShownBoard, f);
  field('closed-count').textContent = closedHidden === 0 ? '' : closedHidden + ' hidden';
};
field('f-text').addEventListener('input', relayout);
const setRow = (row, mode) => {
  row.dataset.mode = mode;
  row.querySelectorAll('[data-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.set === mode)));
};
const choose = (row, mode) => { setRow(row, row.dataset.mode === mode ? '' : mode); relayout(); };
document.querySelectorAll('.pop-row').forEach((row) => {
  row.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => choose(row, b.dataset.set)));
  row.querySelector('.pop-name').addEventListener('click', (e) => choose(row, e.altKey ? 'exclude' : 'include'));
});
const open = () => document.querySelector('.popover:not([hidden])');
const closePopovers = () => document.querySelectorAll('.popover').forEach((p) => { p.hidden = true; p.previousElementSibling.setAttribute('aria-expanded', 'false'); });
document.querySelectorAll('[data-filter-open]').forEach((b) => b.addEventListener('click', () => {
  const pop = b.nextElementSibling;
  const wasOpen = !pop.hidden;
  closePopovers();
  if (!wasOpen) { pop.hidden = false; b.setAttribute('aria-expanded', 'true'); }
}));
document.addEventListener('click', (e) => { if (!e.target.closest('.filter')) closePopovers(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open()) { closePopovers(); return; }
  if (e.key === '/' && !dialog.open && !['INPUT', 'SELECT'].includes(e.target.tagName)) { e.preventDefault(); field('f-text').focus(); }
});
document.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', () => {
  b.closest('.filter').querySelectorAll('.pop-row').forEach((row) => setRow(row, ''));
  relayout();
}));
field('clear-filters').addEventListener('click', () => {
  document.querySelectorAll('.pop-row').forEach((row) => setRow(row, ''));
  field('tag-all').setAttribute('aria-pressed', 'false');
  field('f-text').value = '';
  relayout();
});
field('tag-all').addEventListener('click', () => {
  field('tag-all').setAttribute('aria-pressed', String(field('tag-all').getAttribute('aria-pressed') !== 'true')); relayout();
});
field('show-closed').addEventListener('change', relayout);
field('group-by').addEventListener('change', (e) => {
  document.querySelectorAll('[data-board]').forEach((v) => { v.hidden = v.dataset.board !== e.target.value; });
  vscode.postMessage({ type: 'view', view: e.target.value });
  relayout();
});
document.querySelectorAll('[data-lane-toggle]').forEach((b) => b.addEventListener('click', () => {
  b.setAttribute('aria-expanded', String(b.getAttribute('aria-expanded') !== 'true'));
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
  /** The item's ID as the design shows it: what every ID on the page shares taken off. */
  short: (id: string) => string
}

/** What every ID shares, up to its last hyphen. An ID alone shares nothing: it would lose it all. */
function shortener(items: readonly Item[]): (id: string) => string {
  const [first, ...rest] = items.map((i) => i.id)
  if (first === undefined || rest.length === 0) return (id) => id
  let common = first
  for (const id of rest) while (!id.startsWith(common)) common = common.slice(0, -1)
  const cut = common.lastIndexOf('-') + 1
  return (id) => id.slice(cut)
}

/** Where the item stands in the chain (story nmf.3), and its priority. */
function marks(item: Item, ctx: Context, saidElsewhere = false): string {
  const m = ctx.marks.get(item.id)
  return (m?.awaitingVerification && !saidElsewhere ? '<span class="mark">Awaiting verification</span>' : '') +
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

const stateClass = (item: Item) => `state-${stateOf(item).toLowerCase().replace(/ /g, '-')}`

/** The columns that already say where an item stands, whatever its stored state. */
const COLUMN_SAYS_STATE = ['in_development', 'awaiting_verification']

/**
 * A card, as the redesign draws it (story dox.1): what it is on top, its title
 * cut at two lines, and a foot. The state is left out where its column says it.
 */
function card(item: Item, ctx: Context, column: ViewColumn, meta?: string): string {
  const proposed = isProposal(item) ? ' proposed' : ''
  const state = COLUMN_SAYS_STATE.includes(column.key) || stateOf(item) === column.title
    ? ''
    : `<span class="pill ${stateClass(item)}">${escape(stateOf(item))}</span>`
  const button = `<button class="card ${typeClass(item)}${proposed}" data-open="${escape(item.id)}">` +
    `<span class="card-head">${typeIcon(item.type)}<span class="type">${escape(typeLook(item.type).name)}</span><span class="id">${escape(ctx.short(item.id))}</span>` +
    `${item.priority === undefined ? '' : `<span class="prio">P${item.priority}</span>`}</span>` +
    `<span class="title clamp">${escape(item.title)}</span>` +
    `<span class="foot">${state}${marks({ ...item, priority: undefined }, ctx, column.key === 'awaiting_verification')}${tags(item)}` +
    `${meta === undefined ? '' : `<span class="task-meta">${ICONS.task}${escape(meta)}</span>`}</span></button>`
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
 * One filter for both tabs (story nmf.4), each field a button opening its own
 * dropdown (story dox.3): every value on the page from the start, hidden, since
 * the script never builds markup. Tags can require all of the included ones.
 * Buttons, not inputs: they filter the page and send nothing.
 */
function filterBar(items: readonly Item[]): string {
  const row = (v: string, icon: string, cls: string) =>
    `<div class="pop-row${cls}" data-value="${escape(v)}" data-mode="">${icon}<button class="pop-name">${escape(v)}</button>` +
    '<span class="tri-group"><button class="tri" data-set="include" aria-pressed="false">+ Include</button><button class="tri" data-set="exclude" aria-pressed="false">− Exclude</button></span></div>'
  const field = (name: string, label: string, none: string, noun: string, rows: string, extra = '') =>
    `<div class="filter" data-none="${none}" data-field="${name}"><button class="filt" data-filter-open aria-expanded="false">${label} ` +
    `<span class="filt-included"></span><span class="filt-not" hidden>not</span><span class="filt-excluded"></span>${ICONS.chevron}</button>` +
    `<div class="popover" role="dialog" aria-label="${label} filter" hidden><p class="pop-note">Include shows only those ${noun}. Exclude hides them.</p>${rows}` +
    `<div class="pop-foot"><span>Alt+click a value to exclude it</span>${extra}<button class="link" data-reset>Reset ${label.toLowerCase()}</button></div></div></div>`
  const plain = (list: Iterable<string>) => [...new Set(list)].sort().map((v) => row(v, '', '')).join('')
  const types = [...new Map(items.map((i) => [typeLook(i.type).name, i])).entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([name, i]) => row(name, typeIcon(i.type), ` ${typeClass(i)}`)).join('')
  return '<div class="filters">' +
    field('type', 'Type', 'All', 'types', types) +
    field('state', 'State', 'All', 'states', plain(items.map(stateOf))) +
    field('tag', 'Tags', 'Any', 'tags', plain(items.flatMap(shownTags)), '<button id="tag-all" aria-pressed="false">All of</button>') +
    field('priority', 'Priority', 'Any', 'priorities', plain(items.flatMap((i) => i.priority === undefined ? [] : [`P${i.priority}`]))) +
    '<span id="filter-count" hidden></span><button id="clear-filters" class="link" hidden>Clear filters</button><span class="spacer"></span>' +
    '<label class="toggle-closed"><input type="checkbox" id="show-closed"> Show closed <span id="closed-count"></span></label>' +
    '</div>'
}

/** The state as the grid says it: where the chain has it, which the stored state alone cannot say (story dox.2). */
function statePill(item: Item, ctx: Context): string {
  return ctx.marks.get(item.id)?.awaitingVerification
    ? '<span class="pill state-awaiting">Awaiting verification</span>'
    : `<span class="pill ${stateClass(item)}">${escape(stateOf(item))}</span>`
}

function backlog(items: readonly Item[], ctx: Context): string {
  const body = backlogRows(items)
    .map(({ item, depth, hasChildren }) => {
      const toggle = hasChildren
        ? `<button class="toggle chev" data-toggle="${escape(item.id)}" aria-expanded="true" aria-label="Expand or collapse">${ICONS.chevron}</button>`
        : '<span class="chev"></span>'
      const hidden = hasChildren ? `<span class="hidden-count" data-hidden-count="${escape(item.id)}" hidden></span>` : ''
      return `<tr data-row="${escape(item.id)}" data-parent="${escape(item.parent ?? '')}" ` +
        `data-type="${escape(typeLook(item.type).name)}" data-state="${escape(stateOf(item))}" ` +
        `data-tags="${escape(shownTags(item).join('\u001f'))}" data-title="${escape(item.title)}" data-priority="${item.priority ?? ''}">` +
        `<td class="item-cell ${typeClass(item)} depth-${Math.min(depth, MAX_DEPTH)}"><div class="item-line">${toggle}${typeIcon(item.type)}` +
        `<span class="id">${escape(ctx.short(item.id))}</span><button class="link ttl" data-open="${escape(item.id)}">${escape(item.title)}</button>${hidden}` +
        `${marks({ ...item, priority: undefined }, ctx, true)}${pr(item, ctx)}</div></td>` +
        `<td>${statePill(item, ctx)}</td><td class="priority-cell">${item.priority === undefined ? '' : `P${item.priority}`}</td><td>${tags(item)}</td></tr>`
    })
    .join('')
  const th = (key: string, label: string) => `<th data-sort="${key}" aria-sort="none">${label}</th>`
  return `<table class="backlog"><thead><tr>${th('title', 'Item')}${th('state', 'State')}${th('priority', 'Priority')}${th('tags', 'Tags')}</tr></thead>` +
    `<tbody>${body}<tr id="no-match" hidden><td colspan="4">No items match this filter.</td></tr></tbody></table>`
}

const FIELDS: ReadonlyArray<{ key: keyof Rendered; title: string }> = [
  { key: 'description', title: 'Description' },
  { key: 'acceptance', title: 'Acceptance criteria' },
  { key: 'design', title: 'Design' },
  { key: 'closeReason', title: 'Why it was closed' },
]

function acceptance(raw: string, fallback: string): string {
  const g = parseGherkin(raw)
  if (g === undefined) return fallback
  return (g.feature === undefined ? '' : `<p class="gherkin-feature"><span class="gherkin-key">Feature:</span> ${escape(g.feature)}</p>`) +
    g.scenarios.map((s) => `<div class="scenario"><p class="scenario-name">${escape(s.name)}</p>` +
      s.steps.map((st) => `<div class="step"><span class="gherkin-key">${escape(st.keyword)}</span><span>${escape(st.text)}</span></div>`).join('') +
      '</div>').join('')
}

/** An item, as the redesign's side panel draws it (story dox.4). */
function form(item: Item, rendered: Rendered | undefined, byId: ReadonlyMap<string, Item>, children: readonly Item[], ctx: Context): string {
  const parts = FIELDS.flatMap(({ key, title }) => {
    const raw = item[key]
    if (raw === undefined) return []
    const html = rendered?.[key]
    const body = html === undefined ? `<pre class="raw">${escape(raw)}</pre>` : html
    return [`<div class="panel-section"><h2>${title}</h2>${key === 'acceptance' ? acceptance(raw, body) : `<div>${body}</div>`}</div>`]
  })
  const parent = item.parent === undefined ? undefined : byId.get(item.parent)
  const none = '<span class="stored">None</span>'
  const kids = children.length === 0 ? '' : `<div class="panel-section"><h2>Children <span class="count">${children.length}</span></h2>` + children
    .map((c) => `<button class="child ${typeClass(c)}" data-open="${escape(c.id)}">${typeIcon(c.type)}<span class="id">${escape(ctx.short(c.id))}</span>` +
      `<span class="child-title">${escape(c.title)}</span>${statePill(c, ctx)}</button>`).join('') + '</div>'
  return `<section data-detail="${escape(item.id)}" class="${typeClass(item)}" hidden>` +
    `<header class="panel-head">${typeIcon(item.type)}<span class="type">${escape(typeLook(item.type).name)}</span><span class="id">${escape(ctx.short(item.id))}</span>` +
    `<button class="iconbtn" data-copy="${escape(item.id)}" aria-label="Copy full ID ${escape(item.id)}" title="Copy ID">${ICONS.copy}</button></header>` +
    `<div class="panel-body"><h1 class="panel-title">${escape(item.title)}</h1><dl class="fields">` +
    `<dt>State</dt><dd>${statePill(item, ctx)} <span class="stored">bd state: ${escape(item.status)}</span></dd>` +
    `<dt>Priority</dt><dd>${item.priority === undefined ? none : `P${item.priority}`}</dd>` +
    `<dt>Tags</dt><dd>${tags(item) || none}</dd>` +
    `<dt>Parent</dt><dd>${parent === undefined ? 'None' : `<button class="link" data-open="${escape(parent.id)}">${escape(ctx.short(parent.id))} ${escape(parent.title)}</button>`}</dd></dl>` +
    (parts.join('') || '<p>No text.</p>') + kids + '</div></section>'
}

/** Group by's order, as the redesign lists them. */
const GROUP_ORDER: readonly ViewName[] = ['stories', 'by-story', 'tasks', 'all']
/** The colour of a column title's dot. */
const STATE_OF_COLUMN: Readonly<Record<string, string>> = {
  in_development: 'state-in-progress', in_progress: 'state-in-progress', awaiting_verification: 'state-awaiting',
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
  const ctx: Context = { marks: chainMarks(items), remote: input.remote, short: shortener(items) }
  const active = input.view ?? 'all'
  const groupBy = '<label class="group-by">Group by <select id="group-by">' + GROUP_ORDER
    .map((name) => `<option value="${name}"${name === active ? ' selected' : ''}>${escape(VIEWS.find((v) => v.name === name)!.title)}</option>`)
    .join('') + '</select></label>'
  const board = VIEWS.map(({ name }) => {
    const { lanes } = boardView(items, name)
    const metaOf = (i: Item) => name === 'stories' ? taskMeta(items, i.id) : undefined
    const cols = (lane: Lane) => '<div class="columns">' + lane.columns
      .map((c) => `<div class="column" data-column="${c.key}">${c.items.map((i) => card(i, ctx, c, metaOf(i))).join('')}<div class="empty"></div></div>`)
      .join('') + '</div>'
    // One row of titles for the whole view; a title is hidden with its column, so they stay aligned.
    const first = lanes[0]?.columns ?? []
    const titles = '<div class="col-titles">' + first
      .map((c) => `<div class="col-title${STATE_OF_COLUMN[c.key] === undefined ? '' : ` ${STATE_OF_COLUMN[c.key]}`}" data-column="${c.key}"><span class="dot"></span>${escape(c.title)} ` +
        `<span class="count" data-col-count="${c.key}">${lanes.reduce((n, l) => n + (l.columns.find((x) => x.key === c.key)?.items.length ?? 0), 0)}</span></div>`)
      .join('') + '</div>'
    const body = lanes.map((lane) => lane.title === ''
      ? cols(lane)
      : `<section class="lane" data-lane="${escape(lane.key)}" data-lane-closed="${lane.closed}">` +
        `<button class="lane-head" data-lane-toggle aria-expanded="${!laneIsQuiet(lane)}">${ICONS.chevron}` +
        `${lane.key === '' ? '' : `<span class="type-icon ${name === 'stories' ? 'type-epic' : 'type-feature'}">${name === 'stories' ? ICONS.epic : ICONS.feature}</span>`}` +
        `<span class="lane-title">${escape(lane.title)}</span>${lane.key === '' ? '' : `<span class="id">${escape(ctx.short(lane.key))}</span>`}` +
        `<span class="lane-summary">${escape(laneSummary(lane, name))}</span></button>${cols(lane)}</section>`).join('')
    return `<div data-board="${name}"${name === active ? '' : ' hidden'}><div class="board-grid cols-${first.length}">${titles}${body}</div></div>`
  }).join('')
  const byId = new Map(items.map((i) => [i.id, i]))
  const childrenOf = (id: string) => items.filter((i) => i.parent === id)
  const body = [
    notice === undefined ? '' : `<p class="notice">${escape(notice)}</p>`,
    '<header class="bar">',
    '<nav aria-label="View">',
    `<button class="seg" data-tab="board" aria-pressed="true">${ICONS.board}Board</button>`,
    `<button class="seg" data-tab="backlog" aria-pressed="false">${ICONS.backlog}Backlog</button>`,
    '</nav>',
    groupBy,
    `<span class="backlog-tools" hidden><button id="expand-all" class="iconbtn" aria-label="Expand all" title="Expand all">${ICONS.expand}</button>` +
      `<button id="collapse-all" class="iconbtn" aria-label="Collapse all" title="Collapse all">${ICONS.collapse}</button></span>`,
    '<span class="spacer"></span>',
    `<label class="search">${ICONS.search}<input id="f-text" type="search" placeholder="Filter by ID or title" aria-label="Filter by ID or title"><kbd>/</kbd></label>`,
    `<button id="refresh" class="iconbtn" aria-label="Read work items again" title="Read again">${ICONS.refresh}</button>`,
    '</header>',
    filterBar(items),
    `<div class="view" data-view="board">${board}</div>`,
    `<div class="view" data-view="backlog" hidden>${backlog(items, ctx)}</div>`,
    `<dialog id="detail" aria-label="Work item"><div class="panel-nav">` +
      `<button id="prev-item" class="iconbtn" aria-label="Previous item" title="Previous (k)">${ICONS.up}</button>` +
      `<button id="next-item" class="iconbtn" aria-label="Next item" title="Next (j)">${ICONS.down}</button>` +
      `<button id="close-detail" class="iconbtn" aria-label="Close" title="Close (Esc)">${ICONS.close}</button></div>` +
      `${items.map((i) => form(i, rendered.get(i.id), byId, childrenOf(i.id), ctx)).join('')}</dialog>`,
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
