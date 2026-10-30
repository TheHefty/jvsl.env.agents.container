import type { ProjectFiles } from '../host/files.ts'
import type { Applied } from './create.ts'

/**
 * Writes a scaffold plan through the project's own files, reporting both halves
 * rather than throwing on the first failure. **Through `files`, never a path on
 * this disk** (debt ck8): for a project in a WSL distro that is the distro, and
 * Create from a WSL window used to write the bare Linux path on Windows.
 */
export function apply(files: Pick<ProjectFiles, 'write'>, writes: { path: string; contents: string }[],
               write: (lines: string[]) => void): Applied {
  const written: string[] = []
  const failed: string[] = []
  for (const w of writes) {
    try {
      files.write(w.path, w.contents)
      written.push(w.path)
    } catch (error) {
      write([`create: could not write ${w.path}: ${String(error)}`])
      failed.push(w.path)
    }
  }
  return { written, failed }
}
