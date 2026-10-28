/**
 * The project's tracker, read the one way the extension reads it: from inside
 * the project's container, with `bd export`, which only reads (FR-118). Shared
 * by the board and the Study view, so the two cannot disagree about which
 * container holds the tracker or what a failed read says.
 *
 * scripts/board-only-reads.test.sh holds this file to `bd export`.
 */
import type { Docker } from '../host/docker.ts'
import { filesFor } from '../host/files.ts'
import { containerFor, folderNames, type ProjectOnHost, type Running } from '../host/locate.ts'
import { parseExport, type Item } from './board-read.ts'
import { MANIFEST } from '../shared/stack-manifest.ts'

/** Longer than a status check: the export is the whole tracker. Still bounded. */
export const BOARD_READ_MS = 15000

/** The command run in the container, and the only bd command run. */
export const READ_COMMAND = ['bd', 'export'] as const

export type TrackerRead = { ok: true; items: Item[]; container: string } | { ok: false; title: string; body: string }

const fail = (title: string, body: string): TrackerRead => ({ ok: false, title, body })

export async function readTracker(project: Exclude<ProjectOnHost, { kind: 'none' }>, docker: Docker): Promise<TrackerRead> {
  const hostPath = project.path
  let optedIn = false
  try {
    optedIn = (JSON.parse(filesFor(project).read(MANIFEST) ?? '{}') as Record<string, unknown>)['beads'] === true
  } catch {
    optedIn = false
  }
  if (!optedIn) {
    return fail('This project has no tracker',
      `A project asks for one with "beads": true in ${MANIFEST}, and gets it when its container next boots.`,
    )
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
    return fail('Docker did not answer', `Listing the running containers failed: ${String(error)}`)
  }

  const choice = containerFor(folderNames(project), running)
  if (choice.kind === 'none') {
    return fail("The project's container is not running",
      `The tracker is read from inside the container for ${hostPath}, so there is nothing to show until it runs. ` +
        'Nothing is kept from an earlier reading: a board that looks current and is not is the worse failure.',
    )
  }
  if (choice.kind === 'many') {
    return fail('More than one container claims this project',
      `${choice.names.join(', ')} are all labelled with ${hostPath}. Stop the ones that are not in use; the board ` +
        'will not guess which one holds the real tracker.',
    )
  }

    try {
    const { stdout } = await docker(
      ['exec', '-u', 'abc', '-e', 'HOME=/config', '-w', '/config/workspace', choice.id, ...READ_COMMAND],
      BOARD_READ_MS,
    )
    return { ok: true, items: parseExport(stdout), container: choice.id }
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr
    const why = String(error).includes('timeout')
      ? `it did not finish within ${BOARD_READ_MS / 1000}s`
      : typeof stderr === 'string' && stderr.trim() !== ''
        ? stderr.trim()
        : String(error)
    return fail('The tracker could not be read', `\`bd export\` in the project's container failed: ${why}`)
  }
}
