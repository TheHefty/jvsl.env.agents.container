/**
 * The Study view's topic page (story the-study-view): the guide, rendered with
 * the editor's own Markdown renderer as the board's fields are, with the
 * topic's state and the developer's moves. Since 2026-10-28 a topic is its
 * guide alone (task the-practice-leaves-the-study). Every decision is in
 * topic-page.ts, topics.ts and moves.ts, where it is tested; what is here is
 * the panel and the reads and moves those decisions need.
 */
import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'

import { readTracker } from '../board/tracker.ts'
import type { Docker } from '../host/docker.ts'
import { filesFor, type ProjectFiles } from '../host/files.ts'
import type { ProjectOnHost } from '../host/locate.ts'
import { hostProject } from '../host/project.ts'
import { checkTopicWith } from './contract.ts'
import { runMove, startedDue, type Move } from './moves.ts'
import { problemsPage, topicPage } from './topic-page.ts'
import { STUDY_DIR, topicRows } from './topics.ts'

type Context = { dockerOf: (project: ProjectOnHost) => Docker; write: (lines: string[]) => void; refreshView: () => void }

const panels = new Map<string, vscode.WebviewPanel>()

export function openTopic(slug: string, dockerOf: (project: ProjectOnHost) => Docker, write: (lines: string[]) => void, refreshView: () => void): void {
  const ctx: Context = { dockerOf, write, refreshView }
  const existing = panels.get(slug)
  if (existing !== undefined) {
    existing.reveal()
    void render(existing, slug, ctx, undefined, true).then(refreshView)
    return
  }
  const panel = vscode.window.createWebviewPanel('jvsl.agentContainer.topic', `Study: ${slug}`, vscode.ViewColumn.Active, {
    enableScripts: true,
    localResourceRoots: [],
  })
  panels.set(slug, panel)
  panel.onDidDispose(() => panels.delete(slug))
  panel.webview.onDidReceiveMessage((message: unknown) => {
    const m = message as { type?: unknown; link?: unknown }
    if (m?.type === 'refresh') void render(panel, slug, ctx)
    if (m?.type === 'ready') void move(panel, slug, ctx, 'ready').then(refreshView)
    if (m?.type === 'published') void move(panel, slug, ctx, 'published', typeof m.link === 'string' ? m.link : '').then(refreshView)
  })
  void render(panel, slug, ctx, undefined, true).then(refreshView)
}

function filesHere(): ProjectFiles | string {
  const project = hostProject()
  return project.kind === 'none' ? project.reason : filesFor(project)
}

/**
 * `opening` is true only when the developer opened the topic: that is what
 * starts the study, once. A refresh or a re-render after a move never does.
 */
async function render(panel: vscode.WebviewPanel, slug: string, ctx: Context, notice?: string, opening = false): Promise<void> {
  const nonce = randomBytes(16).toString('hex')
  const files = filesHere()
  if (typeof files === 'string') {
    panel.webview.html = problemsPage({ nonce, title: slug, problems: [files] })
    return
  }
  const read = (name: string) => files.read(`${STUDY_DIR}/${slug}/${name}`)
  const problems = checkTopicWith(read, slug, `${STUDY_DIR}/${slug}`)
  if (problems.length > 0) {
    ctx.write([`study: ${slug} does not follow the contract — ${problems.length} problem(s)`])
    panel.webview.html = problemsPage({ nonce, title: slug, problems: problems.map((p) => `${p.file}: ${p.message}`) })
    return
  }
  const guideText = read('guide.md') ?? ''
  const title = guideText.split('\n').find((l) => l.startsWith('# '))?.slice(2).trim() ?? slug
  let state: string | undefined
  let said = notice
  const project = hostProject()
  if (project.kind !== 'none') {
    const docker = ctx.dockerOf(project)
    let read = await readTracker(project, docker)
    const item = (r: typeof read) => (r.ok ? r.items.find((i) => i.labels.includes('study') && i.metadata?.['study'] === slug) : undefined)
    // Opening a topic still open starts it; a move missed while the container
    // was stopped is due again the next time it is opened, never in a loop.
    if (opening && read.ok && startedDue(item(read))) {
      const started = await runMove(project, docker, slug, 'started')
      ctx.write([`study: ${started.line}`])
      if (started.ok) read = await readTracker(project, docker)
      else said = said ?? started.line
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
  panel.webview.html = topicPage({ nonce, title, guide, ...(said === undefined ? {} : { notice: said }), ...(state === undefined ? {} : { state }) })
}

async function move(panel: vscode.WebviewPanel, slug: string, ctx: Context, which: Move, link?: string): Promise<void> {
  const project = hostProject()
  if (project.kind === 'none') return render(panel, slug, ctx, project.reason)
  const result = await runMove(project, ctx.dockerOf(project), slug, which, link)
  ctx.write([`study: ${result.line}`])
  await render(panel, slug, ctx, result.line)
}
