import { buildConfiguration, isOurs, type BuildInput, type Configuration } from '../build/devcontainer.ts'
import { aiMemoryMarker } from '../create/location.ts'
import { MEMORY_MARKER } from '../configure/switches.ts'
import { CONFIG_PATH, serialise } from '../open/open.ts'

/**
 * The Brainstorm container (story the-brainstorm-command-opens-the-ideation-
 * container, gh-364; task 5kd.2.3).
 *
 * **One per developer and machine, under fixed names of its own.** It is not
 * a project: no manifest, no stack, no id. A project's names come from its
 * folder, so the ideas folder (`…/ideas`) would have been `ideas-dev` and
 * `ideas-code-server-data` — names a project called `ideas` could have, and
 * whose volume it would then share. These cannot come from a folder.
 *
 * **Everything else is a project's container**, built by buildConfiguration:
 * the developer's ~/.claude, the tmpfs over rules/, the image's own command,
 * the limits from the defaults. What differs is the workspace — the ideas
 * folder — and `AGENT_CONTAINER_MODE=ideation`, which the boot reads to
 * install IDEATION.md instead of the development rules (5kd.2.2).
 *
 * **The same bytes on every run.** The tooling identifies a container by a
 * hash of its configuration, so anything that moves between runs would
 * recreate it and lose the session the persistent /config exists to keep.
 */
export const BRAINSTORM = 'agent-container-brainstorm'
export const BRAINSTORM_IMAGE = `${BRAINSTORM}-dev`
export const BRAINSTORM_VOLUME = `${BRAINSTORM}-code-server-data`

export interface BrainstormInput extends Omit<BuildInput, 'projectRoot' | 'id' | 'gradleVersion'> {
  /** The ideas folder, as this machine's docker sees it. */
  ideasDir: string
}

export function brainstormConfiguration(input: BrainstormInput): Configuration {
  const { ideasDir, ...rest } = input
  const base = buildConfiguration({ ...rest, projectRoot: ideasDir })
  return {
    ...base,
    name: BRAINSTORM,
    image: BRAINSTORM_IMAGE,
    // The project's volume is always the first mount (buildConfiguration).
    mounts: [`source=${BRAINSTORM_VOLUME},target=/config,type=volume`, ...base.mounts.slice(1)],
    containerEnv: { ...base.containerEnv, AGENT_CONTAINER_MODE: 'ideation' },
    runArgs: [...base.runArgs, '--name', BRAINSTORM],
  }
}

/** Whether a configuration's text is the Brainstorm container's, rather than a project's or somebody's. */
export function isBrainstorm(raw: string | null): boolean {
  if (raw === null || !isOurs(raw)) return false
  try {
    return (JSON.parse(raw) as { name?: unknown }).name === BRAINSTORM
  } catch {
    return false
  }
}

/**
 * What a run writes into the ideas folder: the configuration when it is absent
 * or differs, and the memory marker when it is absent. **A configuration there
 * that is not Brainstorm's is refused**: it is somebody's work, or a project's,
 * and the file is in nobody's history to recover it from.
 */
export function planBrainstorm(input: {
  configuration: Configuration
  existingConfig: string | null
  markerPresent: boolean
}): { writes: { rel: string; text: string }[] } | { refused: string } {
  const text = serialise(input.configuration)
  if (input.existingConfig !== null && !isBrainstorm(input.existingConfig)) {
    return {
      refused:
        `the ideas folder already has a ${CONFIG_PATH} that is not the Brainstorm container's, so nothing was ` +
        `written. Move it away if it is not needed; it is not overwritten, because nothing keeps a copy of it.`,
    }
  }
  const writes: { rel: string; text: string }[] = []
  if (input.existingConfig !== text) writes.push({ rel: CONFIG_PATH, text })
  if (!input.markerPresent) writes.push({ rel: MEMORY_MARKER, text: aiMemoryMarker() })
  return { writes }
}
