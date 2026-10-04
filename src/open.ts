import { buildConfiguration, isOurs, projectNames, type Configuration } from './devcontainer.ts'
import { isAtLeast, parseVersion } from './template.ts'
import { readLimits } from './limits.ts'
import type { HostFacts } from './host.ts'

export const REOPEN_COMMAND = 'remote-containers.reopenInContainer'
export const CONFIG_PATH = '.devcontainer/devcontainer.json'

/**
 * Everything the decision reads, handed in rather than looked up, so the
 * decision can be tested without a host, a container runtime or an editor.
 * `null` means "not there", which for most of these is the normal case.
 */
export interface OpenContext {
  projectRoot: string
  homeDir: string
  extensionVersion: string
  facts: HostFacts
  manifest: string | null
  existingConfig: string | null
  runningContainers: string[]
  reopenCommandAvailable: boolean
  gitignore: string | null
  /**
   * `.code-server/version.txt`'s contents, or null when it could not be read.
   *
   * The string rather than a parsed version, deliberately: absent and
   * unparseable are different refusals with different fixes, and a parsed
   * version cannot tell them apart.
   */
  /**
   * The minimum this extension works against, from `package.json`.
   *
   * **Passed in rather than declared here**, because a constant in this file
   * would be a second place to keep in step with the manifest — which is
   * exactly the defect this requirement exists to fix: that number was wrong
   * for three releases and nothing read it.
   */
}

export type Decision =
  | {
      action: 'open'
      configuration: Configuration
      notes: string[]
      /**
       * Host directories the configuration's mounts need to already exist.
       *
       * `mounts` uses `--mount` semantics, which **fails** when a bind source
       * is missing — unlike the `-v` the launcher used, which created it
       * silently. A host that has never run an agent has no `~/.claude`, and
       * without creating it the open dies on a mount error that names a path
       * and no cause. Returned rather than created here so this stays pure.
       */
      ensureHostDirs: string[]
    }
  | { action: 'refuse'; cause: string; notes: string[] }

/**
 * Whether to open, and what to say either way. Pure: it writes nothing and
 * invokes nothing, so the caller owns the side effects and this owns the
 * reasoning.
 *
 * **The order of the refusals is deliberate.** Checked first is whether the
 * handover can happen at all, because discovering that *after* writing a file
 * leaves the project changed for an open that was never possible. Then the
 * running launcher, because two containers over one `/config` volume is the
 * only failure here that corrupts data rather than wasting a minute. Then a
 * configuration somebody else wrote, which costs them work but not data.
 */
export function decideOpen(context: OpenContext): Decision {
  const names = projectNames(context.projectRoot)
  const notes: string[] = []

  if (!context.reopenCommandAvailable) {
    return {
      action: 'refuse',
      notes,
      cause:
        `the Dev Containers extension does not provide \`${REOPEN_COMMAND}\`, which is how this ` +
        `hands over. It is a contributed command rather than a published API, so this is what an ` +
        `upstream rename looks like — check that Dev Containers is installed and enabled, and ` +
        `which version it is. Nothing was written.`,
    }
  }
  if (context.runningContainers.includes(names.launcherContainer)) {
    return {
      action: 'refuse',
      notes,
      cause:
        `the container \`${names.launcherContainer}\` is running, which is this project's old ` +
        `launcher. Opening now would create a second container over the same \`/config\` volume: ` +
        `two nested Docker daemons, and two ai-memory servers writing one store. That corruption ` +
        `outlives every rebuild. Stop it first — \`docker stop ${names.launcherContainer}\` — and ` +
        `note that anything running inside it dies with it.`,
    }
  }

  if (context.existingConfig !== null && !isOurs(context.existingConfig)) {
    return {
      action: 'refuse',
      notes,
      cause:
        `\`${CONFIG_PATH}\` exists and was not written by this extension, so it has not been ` +
        `touched. This file is generated and gitignored, which means there is no history to ` +
        `recover a hand-written one from — move it aside yourself if it is no longer wanted.`,
    }
  }

  // Not a refusal: a project whose manifest broke has better things to be told
  // than that its window will not open. But the launcher fell back to defaults
  // in silence, and opening with 6 GiB when the file asked for 8 without a word
  // is what turns this into an unexplained OOM hours later.
  const limits = readLimits(context.manifest ?? '{}')
  if (limits.usedDefaults) {
    notes.push(
      `the project manifest \`.code-server.stack.json\` could not be read, so the default limits ` +
        `are being used ` +
        `(${limits.memory} memory, half the host's cores). Fix the file, or run ` +
        `the \`Dev Container: Configure Stacks and Limits\` command to rewrite it.`,
    )
  }

  if (!ignoresGeneratedConfig(context.gitignore)) {
    notes.push(
      `\`${CONFIG_PATH}\` is generated on every open and is not ignored by git in this project. ` +
        `Add \`${CONFIG_PATH}\` to \`.gitignore\` — committing it would carry this machine's core ` +
        `count and device list into the next clone, where \`--device\` against a path that does ` +
        `not exist is a hard failure.`,
    )
  }

  return {
    action: 'open',
    notes,
    ensureHostDirs: [`${context.homeDir}/.claude`],
    configuration: buildConfiguration({
      projectRoot: context.projectRoot,
      homeDir: context.homeDir,
      extensionVersion: context.extensionVersion,
      limits,
      facts: context.facts,
    }),
  }
}

/**
 * Whether git already ignores the generated file. Deliberately generous about
 * how: a project that ignores the whole `.devcontainer/` directory has made the
 * decision, and nagging it would be the kind of warning people learn to
 * ignore.
 */
function ignoresGeneratedConfig(gitignore: string | null): boolean {
  if (gitignore === null) return false
  return gitignore
    .split('\n')
    .map((line) => line.trim().replace(/^\//, '').replace(/\/$/, ''))
    .some((line) => line === CONFIG_PATH || line === '.devcontainer')
}
