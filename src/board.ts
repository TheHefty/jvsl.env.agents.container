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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as vscode from 'vscode'

import { containerFor, projectOnHost, type Running } from './host/locate.ts'
import { boardPage, messagePage, type Rendered } from './board-page.ts'
import { parseExport, type Item } from './board-read.ts'
import { MANIFEST } from './shared/stack-manifest.ts'

type Docker = (args: string[], ms?: number) => Promise<{ stdout: string; stderr: string }>

/** Longer than a status check: the export is the whole tracker. Still bounded. */
export const BOARD_READ_MS = 15000

/** The command the page runs in the container, and the only bd command it runs. */
export const READ_COMMAND = ['bd', 'export'] as const

let panel: vscode.WebviewPanel | undefined

export async function showWork(docker: Docker, write: (lines: string[]) => void): Promise<void> {
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
      if ((message as { type?: unknown })?.type === 'refresh' && panel !== undefined) {
        void render(panel, docker, write)
      }
    })
  } else {
    panel.reveal()
  }
  await render(panel, docker, write)
}

async function render(target: vscode.WebviewPanel, docker: Docker, write: (lines: string[]) => void): Promise<void> {
  const nonce = randomBytes(16).toString('hex')
  const say = (title: string, body: string) => {
    write([`board: ${title} — ${body}`])
    target.webview.html = messagePage({ nonce, title, body })
  }

  // **The same resolver every command uses**, so the board and the panel can
  // never disagree about which folder is the project.
  const folder = vscode.workspace.workspaceFolders?.[0]
  const project = projectOnHost({
    remoteName: vscode.env.remoteName,
    folder: folder === undefined ? undefined : { fsPath: folder.uri.fsPath, authority: folder.uri.authority },
  })
  if (project.kind === 'none') {
    say('This window could not be traced to a project on this machine', `${project.reason}. The board reads the ` +
      "tracker through the project's container, found by that folder.")
    return
  }
  const hostPath = project.path

  let optedIn = false
  try {
    optedIn = (JSON.parse(readFileSync(join(hostPath, MANIFEST), 'utf8')) as Record<string, unknown>)['beads'] === true
  } catch {
    optedIn = false
  }
  if (!optedIn) {
    say(
      'This project has no tracker',
      `A project asks for one with "beads": true in ${MANIFEST}, and gets it when its container next boots.`,
    )
    return
  }

  let running: Running[]
  try {
    const { stdout } = await docker([
      'ps',
      '--filter', 'label=devcontainer.local_folder',
      '--format', '{{.ID}}\t{{.Names}}\t{{.Label "devcontainer.local_folder"}}',
    ])
    running = stdout
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => {
        const [id = '', name = '', localFolder = ''] = l.split('\t')
        return { id, name, localFolder }
      })
  } catch (error) {
    say('Docker did not answer', `Listing the running containers failed: ${String(error)}`)
    return
  }

  const choice = containerFor(hostPath, running)
  if (choice.kind === 'none') {
    say(
      "The project's container is not running",
      `The tracker is read from inside the container for ${hostPath}, so there is nothing to show until it runs. ` +
        'Nothing is kept from an earlier reading: a board that looks current and is not is the worse failure.',
    )
    return
  }
  if (choice.kind === 'many') {
    say(
      'More than one container claims this project',
      `${choice.names.join(', ')} are all labelled with ${hostPath}. Stop the ones that are not in use; the board ` +
        'will not guess which one holds the real tracker.',
    )
    return
  }

  let items: Item[]
  try {
    const { stdout } = await docker(
      ['exec', '-u', 'abc', '-e', 'HOME=/config', '-w', '/config/workspace', choice.id, ...READ_COMMAND],
      BOARD_READ_MS,
    )
    items = parseExport(stdout)
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr
    const why = String(error).includes('timeout')
      ? `it did not finish within ${BOARD_READ_MS / 1000}s`
      : typeof stderr === 'string' && stderr.trim() !== ''
        ? stderr.trim()
        : String(error)
    say('The tracker could not be read', `\`bd export\` in the project's container failed: ${why}`)
    return
  }

  const { rendered, notice } = await renderAll(items)
  write([`board: ${items.length} item(s) read from ${choice.id}`])
  target.webview.html = boardPage({ nonce, items, rendered, ...(notice === undefined ? {} : { notice }) })
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
