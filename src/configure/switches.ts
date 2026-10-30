import type { ProjectFiles } from '../host/files.ts'
import { aiMemoryMarker } from '../create/location.ts'
import type { Answers } from './questions.ts'

/** ai-memory's switch: the boot hook starts the service only when this file is there. */
export const MEMORY_MARKER = '.ai-memory.toml'

/**
 * What a configuration's answers do to the project's switches beyond the
 * manifest (story d27.1): ai-memory's marker written on a yes, removed on a no.
 * **The switch, never the data**: nothing under `.beads/` and no memory store
 * is touched, and a no says so. Through the project's own files, so a WSL
 * project's marker is written in the distro.
 */
export function applySwitches(
  files: Pick<ProjectFiles, 'exists' | 'write' | 'remove'>,
  answers: Pick<Answers, 'aiMemory' | 'beads'>,
  write: (lines: string[]) => void,
): void {
  if (answers.aiMemory === true && !files.exists(MEMORY_MARKER)) {
    files.write(MEMORY_MARKER, aiMemoryMarker())
    write([`configure: wrote ${MEMORY_MARKER}: ai-memory starts with the container`])
  }
  if (answers.aiMemory === false && files.exists(MEMORY_MARKER)) {
    files.remove(MEMORY_MARKER)
    write([`configure: removed ${MEMORY_MARKER}: ai-memory stays off; the memory store it kept is kept, on the container's volume`])
  }
  if (answers.beads === false) {
    write(['configure: the tracker is off for this project; its .beads/ is kept as it is, with the work it records'])
  }
}
