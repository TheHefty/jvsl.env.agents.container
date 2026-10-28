/**
 * The Study view's topic page (story the-study-view): the guide, rendered with
 * the editor's own Markdown renderer as the board's fields are, then the
 * practice. Every decision is in practice-page.ts and attempts.ts, where it is
 * tested; what is here is the panel, the reads and the one write an attempt is.
 */
import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'

import { filesFor, type ProjectFiles } from '../host/files.ts'
import { hostProject } from '../host/project.ts'
import { checkTopicWith, type Schemas } from './contract.ts'
import { localTimestamp, saveAttempt } from './attempts.ts'
import { practicePage, problemsPage, type Attempts, type Practice } from './practice-page.ts'
import { STUDY_DIR } from './topics.ts'

const panels = new Map<string, vscode.WebviewPanel>()

export function openTopic(slug: string, schemas: Schemas, write: (lines: string[]) => void, refreshView: () => void): void {
  const existing = panels.get(slug)
  if (existing !== undefined) {
    existing.reveal()
    void render(existing, slug, schemas, write)
    return
  }
  const panel = vscode.window.createWebviewPanel('jvsl.agentContainer.topic', `Study: ${slug}`, vscode.ViewColumn.Active, {
    enableScripts: true,
    localResourceRoots: [],
  })
  panels.set(slug, panel)
  panel.onDidDispose(() => panels.delete(slug))
  panel.webview.onDidReceiveMessage((message: unknown) => {
    const m = message as { type?: unknown; id?: unknown; text?: unknown }
    if (m?.type === 'refresh') void render(panel, slug, schemas, write)
    if (m?.type === 'attempt' && typeof m.id === 'string' && typeof m.text === 'string') {
      void attempt(panel, slug, schemas, m.id, m.text, write).then(refreshView)
    }
  })
  void render(panel, slug, schemas, write)
}

function filesHere(): ProjectFiles | string {
  const project = hostProject()
  return project.kind === 'none' ? project.reason : filesFor(project)
}

async function render(panel: vscode.WebviewPanel, slug: string, schemas: Schemas, write: (lines: string[]) => void, notice?: string): Promise<void> {
  const nonce = randomBytes(16).toString('hex')
  const files = filesHere()
  if (typeof files === 'string') {
    panel.webview.html = problemsPage({ nonce, title: slug, problems: [files] })
    return
  }
  const read = (name: string) => files.read(`${STUDY_DIR}/${slug}/${name}`)
  const problems = checkTopicWith(read, slug, schemas, `${STUDY_DIR}/${slug}`)
  if (problems.length > 0) {
    write([`study: ${slug} does not follow the contract — ${problems.length} problem(s)`])
    panel.webview.html = problemsPage({ nonce, title: slug, problems: problems.map((p) => `${p.file}: ${p.path || '/'}: ${p.message}`) })
    return
  }
  const guideText = read('guide.md') ?? ''
  const practice = JSON.parse(read('practice.json') ?? '{}') as Practice
  const attempts = JSON.parse(read('attempts.json') ?? '{}') as Attempts
  const title = guideText.split('\n').find((l) => l.startsWith('# '))?.slice(2).trim() ?? slug
  let guide: { html: string } | { text: string; notice: string }
  try {
    guide = { html: await vscode.commands.executeCommand<string>('markdown.api.render', guideText) }
  } catch (error) {
    guide = { text: guideText, notice: `The editor's Markdown renderer is not available (${String(error)}), so the guide is shown as text.` }
  }
  panel.webview.html = practicePage({ nonce, title, guide, practice, attempts, ...(notice === undefined ? {} : { notice }) })
}

async function attempt(panel: vscode.WebviewPanel, slug: string, schemas: Schemas, id: string, text: string, write: (lines: string[]) => void): Promise<void> {
  const files = filesHere()
  if (typeof files === 'string') return
  const practice = JSON.parse(files.read(`${STUDY_DIR}/${slug}/practice.json`) ?? '{"items":[]}') as Practice
  const saved = saveAttempt(files, slug, practice.items.map((i) => i.id), id, text, localTimestamp(), schemas)
  if (!saved.ok) write([`study: ${slug}/${id}: ${saved.why}`])
  await render(panel, slug, schemas, write, saved.ok ? undefined : saved.why)
}
