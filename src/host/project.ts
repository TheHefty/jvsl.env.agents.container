import { readFileSync } from 'node:fs'
import * as vscode from 'vscode'

import { projectOnHost, type ProjectOnHost } from './locate.ts'

/** The project's folder on the host, for this window. See projectOnHost. */
export function hostProject(): ProjectOnHost {
  const folder = vscode.workspace.workspaceFolders?.[0]
  return projectOnHost({
    remoteName: vscode.env.remoteName,
    folder: folder === undefined ? undefined : { fsPath: folder.uri.fsPath, authority: folder.uri.authority },
  })
}

export function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}
