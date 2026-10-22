import { readFileSync } from 'node:fs'
import * as vscode from 'vscode'

import { onThisMachine, projectOnHost, type ProjectOnHost } from './locate.ts'

/**
 * The project's folder for this window, as the commands may use it. See
 * projectOnHost, and onThisMachine for why a WSL project is not used yet.
 */
export function hostProject(): ProjectOnHost {
  const folder = vscode.workspace.workspaceFolders?.[0]
  return onThisMachine(projectOnHost({
    remoteName: vscode.env.remoteName,
    folder: folder === undefined
      ? undefined
      : { fsPath: folder.uri.fsPath, authority: folder.uri.authority, path: folder.uri.path },
  }))
}

export function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}
