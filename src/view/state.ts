import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { build } from '../build/command.ts'
import { carried } from '../build/template.ts'
import { stacksAvailable } from '../configure/questions.ts'
import { readOrNull } from '../host/project.ts'
import { carriesTemplateSubmodule } from '../migrate/migrate-files.ts'
import { MANIFEST } from '../shared/stack-manifest.ts'
import { type ViewState } from './view.ts'

/**
 * The stacks a project asked for, from its manifest.
 *
 * An unreadable manifest means no stacks rather than an error: the build
 * composes core alone, which is a working image, and the alternative is
 * refusing to build because a file this function could not parse might have
 * named something. The questions are what refuse an unreadable manifest, and
 * they refuse it rather than overwriting it.
 */
export function readManifestStacks(root: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return {}
    const stacks = (parsed as Record<string, unknown>)['stacks']
    return typeof stacks === 'object' && stacks !== null ? (stacks as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function readViewState(root: string, extensionPath: string): ViewState {
  let manifest: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'))
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
    oldFormat: carriesTemplateSubmodule(readOrNull(join(root, '.gitmodules'))),
  }
}
