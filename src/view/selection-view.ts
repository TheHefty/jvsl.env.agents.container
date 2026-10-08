import * as vscode from 'vscode'

import { build } from '../build/command.ts'
import { carried } from '../build/template.ts'
import { CONFIGURE } from '../commands.ts'
import { stacksAvailable } from '../configure/questions.ts'
import { hostProject } from '../host/project.ts'
import { readViewState } from './state.ts'
import { viewItems, type Row } from './view.ts'

/**
 * The sidebar view. **Every decision it makes is in `viewItems`**, which is a
 * function over what is on disk and is tested without an editor; this reads the
 * disk and turns rows into `TreeItem`s.
 */
export class SelectionView implements vscode.TreeDataProvider<Row> {
  /** What the extension carries is not a property of the project being viewed. */
  constructor(private readonly extensionPath: string) {}

  /**
   * A blocking host problem, shown before the panel offers anything.
   *
   * Set once at activation rather than computed per render: `docker info` is the
   * expensive half of the host check, and a tree view re-renders on every
   * refresh.
   */
  private hostProblem: string | undefined
  private sandboxWarning: string | undefined

  recordHostProblem(message: string | undefined): void {
    this.hostProblem = message
    this.refresh()
  }

  /** Why the agents' sandbox will not open on this host; undefined when it will. */
  recordSandboxWarning(message: string | undefined): void {
    this.sandboxWarning = message
    this.refresh()
  }

  private readonly changed = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this.changed.event
  private lastBuild: 'ok' | 'failed' | 'cancelled' | undefined

  refresh(): void {
    this.changed.fire()
  }

  /** Session-scoped on purpose: what the last build did is not a project's state. */
  recordBuild(outcome: 'ok' | 'failed' | 'cancelled'): void {
    this.lastBuild = outcome
    this.refresh()
  }

  getChildren(): Row[] {
    const folder = vscode.workspace.workspaceFolders?.[0]
    if (!folder) {
      // **The panel.** This returned nothing, so the view was invisible exactly
      // when somebody has nothing open and most needs a way in.
      return viewItems({
        stacksAvailable: stacksAvailable(carried(this.extensionPath, 'stacks')),
        manifest: null,
        folderOpen: false,
        hostProblem: this.hostProblem,
        sandboxWarning: this.sandboxWarning,
      })
    }
    const project = hostProject()
    if (project.kind === 'none') {
      return [{ kind: 'note', label: 'This project is not reachable from here', detail: project.reason }]
    }
    return viewItems({
      ...readViewState(project.path, this.extensionPath),
      sandboxWarning: this.sandboxWarning,
      lastBuild: this.lastBuild,
    })
  }

  getTreeItem(row: Row): vscode.TreeItem {
    const item = new vscode.TreeItem(row.label, vscode.TreeItemCollapsibleState.None)
    item.description = row.detail
    if (row.kind === 'empty' || row.kind === 'uninitialised') {
      item.tooltip = row.detail
      if (row.kind === 'empty') {
        item.command = { command: CONFIGURE, title: 'Configure' }
      }
    }
    return item
  }
}
