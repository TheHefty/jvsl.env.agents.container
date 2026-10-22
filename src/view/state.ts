import { join } from 'node:path'

import { carried } from '../build/template.ts'
import { stacksAvailable } from '../configure/questions.ts'
import { readOrNull } from '../host/project.ts'
import { carriesTemplateSubmodule } from '../migrate/migrate-files.ts'
import { MANIFEST } from '../shared/stack-manifest.ts'
import { type ViewState } from './view.ts'

export function readViewState(
  /** The project's folder on this machine, or its files wherever they live (host/files.ts). */
  project: string | { read(rel: string): string | null },
  extensionPath: string,
): ViewState {
  const read = (rel: string): string | null =>
    typeof project === 'string' ? readOrNull(join(project, rel)) : project.read(rel)
  let manifest: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(read(MANIFEST) ?? '')
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      manifest = parsed as Record<string, unknown>
    }
  } catch {
    // Absent or unreadable both mean "nothing to show from it". The questions
    // refuse an unreadable one rather than overwriting it; the view does not
    // need to repeat that refusal to stay honest about what it can see.
  }
  return {
    stacksAvailable: stacksAvailable(carried(extensionPath, 'stacks')),
    manifest,
    oldFormat: carriesTemplateSubmodule((() => { try { return read('.gitmodules') } catch { return null } })()),
  }
}
