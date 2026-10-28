/**
 * The Study view's page for one topic (story the-study-view): its guide, then
 * its practice.
 *
 * **An item with no attempt carries no answer in the page at all.** Hiding it
 * with CSS would still put it in the HTML, one devtools click away, and the
 * practice exists so that the developer tries before they see. The answer is
 * sent once there is an attempt, beside the attempts, each with its date.
 *
 * The guide arrives rendered by the editor's own Markdown renderer, as the
 * board's fields do, so it is HTML by design: the policy, with a nonce new on
 * every render, is what keeps it inert. Everything else is escaped text.
 */
import { escape, shell } from '../board/board-page.ts'

export interface PracticeItem {
  id: string
  kind: 'exercise' | 'question'
  level: number
  prompt: string
  answer: string
  variation: boolean
  angle?: string
}
export interface Practice {
  topic: string
  items: PracticeItem[]
}
export type Attempts = Record<string, { at: string; text: string }[]>

const STYLE = `
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 1rem 2rem; max-width: 52rem; }
.guide { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 1rem; margin-bottom: 1rem; }
.item { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 0.75rem; margin: 0.75rem 0; }
.meta { opacity: 0.75; font-size: 0.9em; }
textarea { width: 100%; min-height: 4rem; font-family: var(--vscode-editor-font-family); }
.answer { border-left: 3px solid var(--vscode-textLink-foreground); padding-left: 0.5rem; }
.attempt { opacity: 0.9; }
.notice { color: var(--vscode-editorWarning-foreground); }
`

const SCRIPT = `const vscode = acquireVsCodeApi();
document.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', () => {
  const id = b.dataset.save;
  const text = document.querySelector('textarea[data-for="' + id + '"]').value;
  vscode.postMessage({ type: 'attempt', id, text });
}));
document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
const ready = document.getElementById('ready');
if (ready) ready.addEventListener('click', () => vscode.postMessage({ type: 'ready' }));
const publish = document.getElementById('publish');
if (publish) publish.addEventListener('click', () => vscode.postMessage({ type: 'published', link: document.getElementById('link').value }));`

const kindOf = (item: PracticeItem): string =>
  [item.kind, `level ${item.level}`, item.variation ? 'what if…?' : '', item.angle === 'when-not-to-use' ? 'when not to use it' : '']
    .filter((x) => x !== '')
    .join(' · ')

function itemSection(item: PracticeItem, attempts: Attempts): string {
  const mine = attempts[item.id] ?? []
  const earlier = mine.length === 0
    ? ''
    : '<h4>Your attempts</h4>' + mine.map((a) => `<p class="attempt"><span class="meta">${escape(a.at)}</span><br>${escape(a.text)}</p>`).join('') +
      `<h4>Answer</h4><p class="answer">${escape(item.answer)}</p>`
  return (
    `<section class="item" data-item="${escape(item.id)}">` +
    `<p class="meta">${escape(item.id)} · ${escape(kindOf(item))}</p>` +
    `<p>${escape(item.prompt)}</p>` +
    earlier +
    `<textarea data-for="${escape(item.id)}" aria-label="Your attempt at ${escape(item.id)}"></textarea>` +
    `<button data-save="${escape(item.id)}">${mine.length === 0 ? 'Save attempt and see the answer' : 'Save another attempt'}</button>` +
    '</section>'
  )
}

export function practicePage(input: {
  nonce: string
  title: string
  guide: { html: string } | { text: string; notice: string }
  practice: Practice
  attempts: Attempts
  notice?: string
  /** The topic's state in the tracker, as the Study view says it. */
  state?: string
}): string {
  const { nonce, title, guide, practice, attempts, notice, state } = input
  // Published is the end: nothing to move. Anything else offers both moves, and
  // study-move — which reads the files themselves — decides whether they are
  // earned, so the page never has to be trusted with that.
  const moves = state === 'published'
    ? ''
    : '<p><button id="ready">Ready to write</button> ' +
      '<input id="link" type="url" placeholder="https://… the published post" aria-label="The post\'s link"> ' +
      '<button id="publish">Mark published</button></p>'
  const guideHtml = 'html' in guide
    ? guide.html
    : `<p class="notice">${escape(guide.notice)}</p><pre>${escape(guide.text)}</pre>`
  const body = [
    `<h1>${escape(title)}</h1>`,
    state === undefined ? '' : `<p class="meta">State: ${escape(state)}</p>`,
    notice === undefined ? '' : `<p class="notice">${escape(notice)}</p>`,
    moves,
    `<div class="guide">${guideHtml}</div>`,
    '<h2>Practice</h2>',
    '<p class="meta">Each answer stays hidden until you have written an attempt.</p>',
    ...practice.items.map((i) => itemSection(i, attempts)),
    '<nav><button id="refresh">Read again</button></nav>',
  ].join('\n')
  return shell(nonce, body, SCRIPT, STYLE)
}

/** A topic that breaks its contract opens on its problems, never on a guide that may hold an answer. */
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
