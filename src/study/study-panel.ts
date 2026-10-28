/**
 * The Study view's topic page (story the-study-view): the guide, rendered with
 * the editor's own Markdown renderer as the board's fields are, then the
 * practice. Every decision is in practice-page.ts and attempts.ts, where it is
 * tested; what is here is the panel, the reads and the one write an attempt is.
 */
import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'

import { readTracker } from '../board/tracker.ts'
import type { Docker } from '../host/docker.ts'
import { filesFor, type ProjectFiles } from '../host/files.ts'
import type { ProjectOnHost } from '../host/locate.ts'
import { hostProject } from '../host/project.ts'
import { runMove, startedDue, type Move } from './moves.ts'
import { topicRows } from './topics.ts'
import { checkTopicWith, type Schemas } from './contract.ts'
import { localTimestamp, saveAttempt } from './attempts.ts'
import { practicePage, problemsPage, type Attempts, type Practice } from './practice-page.ts'
import { STUDY_DIR } from './topics.ts'

const panels = new Map<string, vscode.WebviewPanel>()

type Context = { schemas: Schemas; dockerOf: (project: ProjectOnHost) => Docker; write: (lines: string[]) => void; refreshView: () => void }

export function openTopic(slug: string, schemas: Schemas, dockerOf: (project: ProjectOnHost) => Docker, write: (lines: string[]) => void, refreshView: () => void): void {
  const ctx: Context = { schemas, dockerOf, write, refreshView }
  const existing = panels.get(slug)
  if (existing !== undefined) {
    existing.reveal()
    void render(existing, slug, ctx)
    return
  }
  const panel = vscode.window.createWebviewPanel('jvsl.agentContainer.topic', `Study: ${slug}`, vscode.ViewColumn.Active, {
    enableScripts: true,
    localResourceRoots: [],
  })
  panels.set(slug, panel)
  panel.onDidDispose(() => panels.delete(slug))
  panel.webview.onDidReceiveMessage((message: unknown) => {
    const m = message as { type?: unknown; id?: unknown; text?: unknown; link?: unknown }
    if (m?.type === 'refresh') void render(panel, slug, ctx)
    if (m?.type === 'attempt' && typeof m.id === 'string' && typeof m.text === 'string') {
      void attempt(panel, slug, ctx, m.id, m.text).then(refreshView)
    }
    if (m?.type === 'ready') void move(panel, slug, ctx, 'ready').then(refreshView)
    if (m?.type === 'published') void move(panel, slug, ctx, 'published', typeof m.link === 'string' ? m.link : '').then(refreshView)
  })
  void render(panel, slug, ctx)
}

function filesHere(): ProjectFiles | string {
  const project = hostProject()
  return project.kind === 'none' ? project.reason : filesFor(project)
}

async function render(panel: vscode.WebviewPanel, slug: string, ctx: Context, notice?: string, startedOnce = false): Promise<void> {
  const { schemas, write } = ctx
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
  // The topic's state, and the started a missed move left due: the tracker
  // catches up with the attempts on the next render, never silently.
  const project = hostProject()
  let state: string | undefined
  let said = notice
  if (project.kind !== 'none') {
    const docker = ctx.dockerOf(project)
    const read = await readTracker(project, docker)
    const item = read.ok ? read.items.find((i) => i.labels.includes('study') && i.metadata?.['study'] === slug) : undefined
    // At most once per render: a started that fails leaves it due, and must
    // not be retried here in a loop — the next open retries it.
    if (read.ok && !startedOnce && startedDue(attempts, item)) {
      const started = await runMove(project, docker, slug, 'started')
      write([`study: ${started.line}`])
      if (started.ok) return render(panel, slug, ctx, said, true)
      said = said ?? started.line
    }
    const [row] = topicRows([{ slug, title, problems: [] }], read.ok ? { ok: true, items: read.items } : { ok: false, why: read.title.toLowerCase() })
    state = row?.detail
  }
  let guide: { html: string } | { text: string; notice: string }
  try {
    guide = { html: await vscode.commands.executeCommand<string>('markdown.api.render', guideText) }
  } catch (error) {
    guide = { text: guideText, notice: `The editor's Markdown renderer is not available (${String(error)}), so the guide is shown as text.` }
  }
  panel.webview.html = practicePage({ nonce, title, guide, practice, attempts, ...(said === undefined ? {} : { notice: said }), ...(state === undefined ? {} : { state }) })
}

async function attempt(panel: vscode.WebviewPanel, slug: string, ctx: Context, id: string, text: string): Promise<void> {
  const { schemas, write } = ctx
  const files = filesHere()
  if (typeof files === 'string') return
  const practice = JSON.parse(files.read(`${STUDY_DIR}/${slug}/practice.json`) ?? '{"items":[]}') as Practice
  const saved = saveAttempt(files, slug, practice.items.map((i) => i.id), id, text, localTimestamp(), schemas)
  if (!saved.ok) write([`study: ${slug}/${id}: ${saved.why}`])
  // Saved even when the tracker cannot be updated: the attempt is the
  // developer's work, and render() applies the started it makes due.
  await render(panel, slug, ctx, saved.ok ? undefined : saved.why)
}

async function move(panel: vscode.WebviewPanel, slug: string, ctx: Context, which: Move, link?: string): Promise<void> {
  const project = hostProject()
  if (project.kind === 'none') return render(panel, slug, ctx, project.reason)
  const result = await runMove(project, ctx.dockerOf(project), slug, which, link)
  ctx.write([`study: ${result.line}`])
  await render(panel, slug, ctx, result.line)
}
