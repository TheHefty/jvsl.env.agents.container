/**
 * Moving a study topic through the tracker (story
 * the-view-moves-the-topic-in-the-tracker).
 *
 * **The extension runs no bd write.** It runs the plugin's `study-move` inside
 * the project's container, which makes three moves — started, ready, published
 * — and only on an item labelled `study`. A view able to run any bd command is one bug away from
 * closing the wrong item; scripts/board-only-reads.test.sh holds src/study to
 * `bd export` and this one script.
 *
 * **Never silent.** A refusal comes back as the script's own line; a stopped
 * container as the reason. A `started` missed while the container was stopped
 * is due again the next time the topic is opened.
 */
import { containerOf, inContainer } from '../board/tracker.ts'
import type { Item } from '../board/board-read.ts'
import type { Docker } from '../host/docker.ts'
import type { ProjectOnHost } from '../host/locate.ts'

export const STUDY_MOVE = '/opt/jvsl/plugins/agent-container/bin/study-move'

/** Bounded like every docker call; a move is one jq and one bd command. */
export const MOVE_MS = 15000

export type Move = 'started' | 'ready' | 'published'

/** Opening a topic starts it, when it is still open (task the-practice-leaves-the-study). */
export function startedDue(item: Item | undefined): boolean {
  return item !== undefined && item.status === 'open'
}

export async function runMove(
  project: Exclude<ProjectOnHost, { kind: 'none' }>,
  docker: Docker,
  slug: string,
  move: Move,
  link?: string,
): Promise<{ ok: boolean; line: string }> {
  const found = await containerOf(project, docker)
  if (!found.ok) return { ok: false, line: `The tracker was not updated: ${found.title.toLowerCase()}. ${found.body}` }
  const argv = [STUDY_MOVE, slug, move, ...(link === undefined ? [] : [link])]
  try {
    const { stdout } = await docker(inContainer(found.id, argv), MOVE_MS)
    return { ok: true, line: stdout.trim() }
  } catch (error) {
    const out = (error as { stdout?: unknown }).stdout
    const said = typeof out === 'string' && out.trim() !== '' ? out.trim() : String(error)
    return { ok: false, line: said }
  }
}
