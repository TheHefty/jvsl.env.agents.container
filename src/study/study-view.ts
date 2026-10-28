/**
 * The Study view's shell (story the-study-view): the tree of topics. Every
 * decision is in topics.ts, where it is tested; what is here is the editor and
 * the reads those decisions need. It only reads — the topic folders through the
 * project's files, the tracker through the board's `bd export`.
 */
import { join } from 'node:path'
import * as vscode from 'vscode'

import { OPEN_TOPIC } from '../commands.ts'
import { readTracker } from '../board/tracker.ts'
import type { Docker } from '../host/docker.ts'
import { filesFor } from '../host/files.ts'
import type { ProjectOnHost } from '../host/locate.ts'
import { hostProject } from '../host/project.ts'
import { loadSchemas, type Schemas } from './contract.ts'
import { readTopics, topicRows, type TopicRow } from './topics.ts'

/** The schemas from the extension's own copy of core/, which ships in the .vsix. */
export function schemasFrom(extensionPath: string): Schemas {
  return loadSchemas(join(extensionPath, 'core', 'plugin', 'agent-container', 'study'))
}

type Row = TopicRow | { slug: ''; label: string; detail: string; state: 'unknown' }

export class StudyView implements vscode.TreeDataProvider<Row> {
  constructor(
    private readonly extensionPath: string,
    private readonly dockerOf: (project: ProjectOnHost) => Docker,
    private readonly write: (lines: string[]) => void,
  ) {}

  private readonly changed = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this.changed.event

  refresh(): void {
    this.changed.fire()
  }

  async getChildren(): Promise<Row[]> {
    const project = hostProject()
    if (project.kind === 'none') return [{ slug: '', label: 'No project here', detail: project.reason, state: 'unknown' }]
    const files = filesFor(project)
    let topics
    try {
      topics = readTopics(files, schemasFrom(this.extensionPath))
    } catch (error) {
      this.write([`study: the topics could not be read — ${String(error)}`])
      return [{ slug: '', label: 'The topics could not be read', detail: String(error), state: 'unknown' }]
    }
    if (topics.length === 0) return [{ slug: '', label: 'No study topics yet', detail: 'the study skill builds them in docs/study/', state: 'unknown' }]
    const read = await readTracker(project, this.dockerOf(project))
    if (!read.ok) this.write([`study: ${read.title} — ${read.body}`])
    return topicRows(topics, read.ok ? { ok: true, items: read.items } : { ok: false, why: read.title.toLowerCase() })
  }

  getTreeItem(row: Row): vscode.TreeItem {
    const item = new vscode.TreeItem(row.label, vscode.TreeItemCollapsibleState.None)
    item.description = row.detail
    item.tooltip = row.detail
    if (row.slug !== '') item.command = { command: OPEN_TOPIC, title: 'Open the topic', arguments: [row.slug] }
    return item
  }
}
