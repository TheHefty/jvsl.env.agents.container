/**
 * The Study view's page for one topic (story the-study-view): its guide, its
 * state, and the moves the developer makes.
 *
 * Since 2026-10-28 a topic is its guide alone (task the-practice-leaves-the-study).
 * The guide arrives rendered by the editor's own Markdown renderer, as the
 * board's fields do, so it is HTML by design: the policy, with a nonce new on
 * every render, is what keeps it inert. Everything else is escaped text.
 */
import { escape, shell } from '../board/board-page.ts'

const STYLE = `
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 1rem 2rem; max-width: 52rem; }
.meta { opacity: 0.75; font-size: 0.9em; }
.moves { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.75rem; }
.notice { color: var(--vscode-editorWarning-foreground); }
`

const SCRIPT = `const vscode = acquireVsCodeApi();
document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
const ready = document.getElementById('ready');
if (ready) ready.addEventListener('click', () => vscode.postMessage({ type: 'ready' }));
const publish = document.getElementById('publish');
if (publish) publish.addEventListener('click', () => vscode.postMessage({ type: 'published', link: document.getElementById('link').value }));`

export function topicPage(input: {
  nonce: string
  title: string
  guide: { html: string } | { text: string; notice: string }
  notice?: string
  /** The topic's state in the tracker, as the Study view says it. */
  state?: string
}): string {
  const { nonce, title, guide, notice, state } = input
  const guideHtml = 'html' in guide ? guide.html : `<p class="notice">${escape(guide.notice)}</p><pre>${escape(guide.text)}</pre>`
  // Published is the end: nothing to move. Anything else offers both moves, and
  // study-move decides whether each is allowed.
  const moves = state === 'published'
    ? ''
    : '<p class="moves"><button id="ready">Ready to write</button> ' +
      '<input id="link" type="url" placeholder="https://… the published post" aria-label="The post\'s link"> ' +
      '<button id="publish">Mark published</button></p>'
  const body = [
    `<h1>${escape(title)}</h1>`,
    state === undefined ? '' : `<p class="meta">State: ${escape(state)}</p>`,
    notice === undefined ? '' : `<p class="notice">${escape(notice)}</p>`,
    moves,
    `<div class="guide">${guideHtml}</div>`,
    '<nav><button id="refresh">Read again</button></nav>',
  ].join('\n')
  return shell(nonce, body, SCRIPT, STYLE)
}

/** A topic that breaks its contract opens on its problems. */
export function problemsPage(input: { nonce: string; title: string; problems: readonly string[] }): string {
  const body = [
    `<h1>${escape(input.title)}</h1>`,
    '<p class="notice">This topic does not follow the study contract, so it is not shown until it does.</p>',
    `<ul>${input.problems.map((p) => `<li>${escape(p)}</li>`).join('')}</ul>`,
    '<p class="meta">Run study-validate on its folder, or ask the study skill to rebuild it.</p>',
    '<nav><button id="refresh">Read again</button></nav>',
  ].join('\n')
  return shell(input.nonce, body, `const vscode = acquireVsCodeApi();
document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));`, STYLE)
}
