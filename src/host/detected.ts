import * as vscode from 'vscode'

import { formatDetected } from './diagnostics.ts'
import { hostFacts } from './host.ts'
import { hostProject } from './project.ts'

export async function showDetected(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
  write: (lines: string[]) => void,
): Promise<void> {
  write(await describe(context))
  channel.show(true)
}

export async function describe(context: vscode.ExtensionContext): Promise<string[]> {
  const project = hostProject()
  if (project.kind === 'none') return [`no project to describe: ${project.reason}`]
  return [
    `project: ${project.path}`,
    ...formatDetected({
      facts: hostFacts(),
      // **Where this extension runs, not where the window points.** remoteName
      // says the window is remote; it was read as "the extension is not on the
      // host" and printed a false alarm in every connected window. The
      // extension's own kind is the answer: UI runs on the host.
      runningOnHost: context.extension?.extensionKind === vscode.ExtensionKind?.UI,
    }),
  ]
}

export function packageJSON(context: vscode.ExtensionContext): Record<string, unknown> {
  return (context.extension?.packageJSON ?? {}) as Record<string, unknown>
}

export function templateMinVersion(context: vscode.ExtensionContext): string {
  const declared = packageJSON(context)['templateMinVersion']
  return typeof declared === 'string' ? declared : 'unknown'
}

export function extensionVersion(context: vscode.ExtensionContext): string {
  const declared = packageJSON(context)['version']
  return typeof declared === 'string' ? declared : '0.0.0'
}
