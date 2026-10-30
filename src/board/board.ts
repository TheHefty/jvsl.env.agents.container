/**
 * The board's shell: finds the project's container, reads its tracker, and
 * shows the page. Every decision is in board-locate.ts, board-read.ts and
 * board-page.ts, where it is tested; what is here is the editor and the
 * process calls those decisions need.
 *
 * **It runs exactly one bd command, `bd export`, which only reads** (FR-118).
 * scripts/board-only-reads.test.sh fails if any other appears in these files.
 */
import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'

import type { Docker } from '../host/docker.ts'
import type { ProjectOnHost } from '../host/locate.ts'
import { hostProject } from '../host/project.ts'
import { boardPage, messagePage, type Rendered } from './board-page.ts'
import { filesFor } from '../host/files.ts'
import { onBoardMessage, rememberedView, VIEW_KEY } from './board-message.ts'
import { originUrl } from './pr-link.ts'
import { readTracker } from './tracker.ts'
import type { Item } from './board-read.ts'




let panel: vscode.WebviewPanel | undefined

export { BOARD_READ_MS, READ_COMMAND } from './tracker.ts'

export async function showWork(
  dockerOf: (project: ProjectOnHost) => Docker,
  write: (lines: string[]) => void,
  /** The workspace's own memory: where the board view chosen is kept (story nmf.2). */
  memory: vscode.Memento,
): Promise<void> {
  if (panel === undefined) {
    panel = vscode.window.createWebviewPanel('jvsl.agentContainer.board', 'Work', vscode.ViewColumn.Active, {
      enableScripts: true,
      // Nothing is loaded from disk: the page is one string, and its policy
      // forbids loading anything at all.
      localResourceRoots: [],
    })
    panel.onDidDispose(() => {
      panel = undefined
    })
    panel.webview.onDidReceiveMessage((message: unknown) => {
      onBoardMessage(message, {
        refresh: () => { if (panel !== undefined) void render(panel, dockerOf, write, memory) },
        remember: (view) => { void memory.update(VIEW_KEY, view) },
      })
    })
  } else {
    panel.reveal()
  }
  await render(panel, dockerOf, write, memory)
}

async function render(
  target: vscode.WebviewPanel,
  dockerOf: (project: ProjectOnHost) => Docker,
  write: (lines: string[]) => void,
  memory: vscode.Memento,
): Promise<void> {
  const nonce = randomBytes(16).toString('hex')
  const say = (title: string, body: string) => {
    write([`board: ${title} — ${body}`])
    target.webview.html = messagePage({ nonce, title, body })
  }

  // **The same resolver every command uses**, so the board and the panel can
  // never disagree about which folder is the project.
  const project = hostProject()
  if (project.kind === 'none') {
    say('This window could not be traced to a project on this machine', `${project.reason}. The board reads the ` +
      "tracker through the project's container, found by that folder.")
    return
  }
  const docker = dockerOf(project)

  const read = await readTracker(project, docker)
  if (!read.ok) {
    say(read.title, read.body)
    return
  }
  const items = read.items

  const { rendered, notice } = await renderAll(items)
  write([`board: ${items.length} item(s) read from ${read.container}`])
  const view = rememberedView(memory.get(VIEW_KEY))
  // The origin a task's PR link is built from (story nmf.3), read through the
  // project's own files. A project that cannot be read shows the number only.
  let remote: string | undefined
  try {
    remote = originUrl(filesFor(project).read('.git/config'))
  } catch (error) {
    write([`board: the project's origin could not be read, so pull requests show as numbers: ${String(error)}`])
  }
  target.webview.html = boardPage({
    nonce, items, rendered, view, ...(remote === undefined ? {} : { remote }), ...(notice === undefined ? {} : { notice }),
  })
}

/**
 * Renders each item's long fields with VS Code's own Markdown renderer, so the
 * extension carries no runtime dependency for it. If the renderer is not there
 * (the built-in Markdown extension disabled), every field is shown as plain
 * text and the page says why. The page's policy, not this, is what keeps the
 * rendered HTML inert.
 */
async function renderAll(items: readonly Item[]): Promise<{ rendered: Map<string, Rendered>; notice?: string }> {
  const rendered = new Map<string, Rendered>()
  for (const item of items) {
    const out: Rendered = {}
    for (const key of ['description', 'acceptance', 'design', 'closeReason'] as const) {
      const text = item[key]
      if (text === undefined) continue
      try {
        out[key] = await vscode.commands.executeCommand<string>('markdown.api.render', text)
      } catch (error) {
        return {
          rendered: new Map(),
          notice: `Items are shown as plain text: VS Code's Markdown renderer did not answer (${String(error)}). ` +
            'It belongs to the built-in Markdown extension.',
        }
      }
    }
    rendered.set(item.id, out)
  }
  return { rendered }
}
