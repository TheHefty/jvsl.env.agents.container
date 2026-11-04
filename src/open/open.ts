import { buildConfiguration, isOurs, projectId, projectNames, type Configuration } from '../build/devcontainer.ts'
import { gradleVersion, type GradleBuild } from '../build/gradle.ts'
import { readLimits, type LimitsRead } from '../build/limits.ts'
import { wslDockerProblem, type DockerHost } from '../host/docker.ts'
import { isFolderOf, WSL_READY } from '../host/locate.ts'
import { MANIFEST } from '../shared/stack-manifest.ts'
import type { HostFacts } from '../host/host.ts'

export const REOPEN_COMMAND = 'remote-containers.reopenInContainer'
export const CONFIG_PATH = '.devcontainer/devcontainer.json'

/**
 * Everything the decision reads, handed in rather than looked up, so the
 * decision can be tested without a host, a container runtime or an editor.
 * `null` means "not there", which for most of these is the normal case.
 */
export type ImageState = 'present' | 'absent' | 'unknown' | 'no-docker'

export interface OpenContext {
  projectRoot: string
  homeDir: string
  /**
   * Where this machine reaches homeDir, when that differs: a WSL project binds
   * the distro's home, created here through UNC. Defaults to homeDir.
   */
  localHome?: string
  extensionVersion: string
  facts: HostFacts
  manifest: string | null
  existingConfig: string | null
  runningContainers: string[]
  /**
   * The running containers, each with its Dev Containers folder label and
   * every mount, from the same `docker ps` as runningContainers (containersFrom).
   * Absent when docker was not asked, which checks nothing.
   */
  containers?: ContainerRow[]
  /** Every form of this project's folder its own container's label may carry (folderNames); projectRoot when absent. */
  ownFolders?: string[]
  reopenCommandAvailable: boolean
  /**
   * Whether this project's image is there — and **`unknown` is not `absent`.**
   *
   * `docker image inspect` fails when the daemon is unreachable as well as when
   * the image is missing, and FR-24 already refuses an unreachable daemon.
   * Reading one as the other turns a host problem into a seven-minute build
   * nobody asked for, which then fails for a third reason. "Cannot tell" is not
   * a reason to build.
   */
  image: ImageState
  gitignore: string | null
  /** The project's Gradle builds, sorted, from gradle.ts's bounded scan. */
  gradleBuilds: GradleBuild[]
  /** Where this extension runs, for refusals that name what to install or start. */
  platform?: NodeJS.Platform
  /**
   * Where docker runs for this project. **A WSL project's docker is its
   * distro's**, even though the editor's platform is win32: its refusals name
   * the distro, not Docker Desktop, which is optional there. Absent means this
   * machine.
   */
  dockerHost?: DockerHost
  /** What measuring the machine had to say, such as a device probe that could not run. */
  factNotes?: string[]
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
      /** For the output channel only: decided, and nothing anyone has to act on. */
      log: string[]
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
   * The configuration is written and then the image is built, and only a
   * successful build hands over.
   *
   * **It carries the whole `open` payload** rather than being a separate
   * answer, because the configuration has to be on disk before the handover
   * whatever the build does — and because a decision that said only "build"
   * would make the caller ask twice and get two answers from one state.
   */
  | {
      action: 'build'
      cause: string
      configuration: Configuration
      notes: string[]
      log: string[]
      ensureHostDirs: string[]
    }

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
  const notes: string[] = []
  // **The id first** (gh-325): it names the image and the /config volume
  // every check below reads, so one that is not an id is refused before any.
  const read = projectId(context.manifest)
  if (!read.ok) return { action: 'refuse', notes, cause: `${read.message} Nothing was written.` }
  const names = projectNames(context.projectRoot, read.id)

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

  // **Any other live container on this project's /config** (gh-325, gam.2):
  // the launcher above is one name, and a clone opened from another folder or
  // a hand-run `docker run -v` is the same corruption under any other. The
  // project's own container — its folder in the label, in any form — is not.
  const own = context.ownFolders ?? [context.projectRoot]
  const others = (context.containers ?? []).filter(
    (c) => c.mounts.includes(names.volume) && !isFolderOf(own, c.localFolder),
  )
  if (others.length > 0) {
    const which = others
      .map((c) => `\`${c.name}\`${c.localFolder === '' ? '' : ` (opened from ${c.localFolder})`}`)
      .join(', ')
    return {
      action: 'refuse',
      notes,
      cause:
        `${which} is running with this project's \`/config\` volume, \`${names.volume}\`, mounted, and ` +
        `is not this project's container. Opening now would put a second container over the same ` +
        `volume: two nested Docker daemons, and two ai-memory servers writing one store. That ` +
        `corruption outlives every rebuild. Stop it first — \`docker stop ${others[0]!.name}\` — and ` +
        `note that anything running inside it dies with it. Nothing was written.`,
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

  // A limit in a shape Docker would refuse far from its cause is refused
  // here, naming the file, the field and the form (gh-326) — forwarding it
  // fails at container creation inside Dev Containers, naming a flag.
  const built = configurationFor(context)
  const limits = built.limits
  if (limits.refusal !== undefined) {
    return {
      action: 'refuse',
      notes,
      cause:
        `the project manifest \`${MANIFEST}\` carries ${limits.refusal}. Fix the file, or run the ` +
        `\`Agent Container: Configure Stacks and Limits\` command to rewrite it. Nothing was opened.`,
    }
  }

  // Not a refusal: a project whose manifest broke has better things to be told
  // than that its window will not open. But the launcher fell back to defaults
  // in silence, and opening with 6 GiB when the file asked for 8 without a word
  // is what turns this into an unexplained OOM hours later.
  if (limits.limits.usedDefaults) {
    notes.push(
      `the project manifest \`${MANIFEST}\` could not be read, so the default limits ` +
        `are being used ` +
        `(${limits.limits.memory} memory, half the host's cores). Fix the file, or run ` +
        `the \`Agent Container: Configure Stacks and Limits\` command to rewrite it.`,
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

  // **After every refusal and before the handover.** There is no point spending
  // seven minutes on a build and then declining to overwrite somebody's
  // hand-written configuration, so this is last of the things that can change
  // the answer.
  //
  // `unknown` is refused rather than built: `docker image inspect` fails when
  // the daemon is unreachable as well as when the image is absent, and reading
  // one as the other turns a host problem into a build that fails for a third
  // reason.
  const host = context.dockerHost
  if (host?.kind === 'wsl' && (context.image === 'no-docker' || context.image === 'unknown')) {
    return { action: 'refuse', notes, cause: `${wslDockerProblem(host.distro, context.image === 'no-docker' ? 'absent' : 'unanswered')} Nothing was written.` }
  }
  const windows = context.platform === 'win32'
  if (context.image === 'no-docker') {
    return {
      action: 'refuse',
      notes,
      cause: windows
        ? `Docker Desktop is not installed, or docker.exe is not on the PATH the editor starts with. ` +
          `Install it from https://docs.docker.com/desktop/ and open the project again. Nothing was written.`
        : `docker is not installed, or not on the PATH the editor starts with, so ${names.image} cannot be ` +
          `checked or built. Install docker and open the project again. Nothing was written.`,
    }
  }
  if (context.image === 'unknown' && windows) {
    return {
      action: 'refuse',
      notes,
      cause:
        `Docker Desktop is installed but its engine is not answering, so whether ${names.image} exists ` +
        `could not be determined. Start Docker Desktop, wait until it says the engine is running, and open ` +
        `the project again. Nothing was written.`,
    }
  }
  if (context.image === 'unknown') {
    return {
      action: 'refuse',
      notes,
      cause:
        `whether ${names.image} exists could not be determined — the docker daemon did not ` +
        `answer. Nothing was written. This is not the same as the image being missing, and ` +
        `guessing would start something that takes minutes and then fails for another reason.`,
    }
  }

  // A warning, never a refusal: a project whose wrappers disagree still opens,
  // and is told what the editor will do about its wrapperless builds.
  notes.push(...built.warnings)
  notes.push(...(context.factNotes ?? []))

  const payload = {
    notes,
    log: built.log,
    ensureHostDirs: [credentialsDir(context.localHome ?? context.homeDir)],
    configuration: built.configuration,
  }

  if (context.image === 'absent') {
    return {
      action: 'build',
      ...payload,
      cause:
        `${names.image} does not exist yet, so it is built before the editor attaches. The ` +
        `build runs in a terminal and takes minutes; closing that terminal stops it, and a ` +
        `build that was stopped does not open the project.`,
    }
  }

  return { action: 'open', ...payload }
}

/**
 * Whether git already ignores the generated file. Deliberately generous about
 * how: a project that ignores the whole `.devcontainer/` directory has made the
 * decision, and nagging it would be the kind of warning people learn to
 * ignore.
 */
export function ignoresGeneratedConfig(gitignore: string | null): boolean {
  if (gitignore === null) return false
  return gitignore
    .split('\n')
    .map((line) => line.trim().replace(/^\//, '').replace(/\/$/, ''))
    .some((line) => line === CONFIG_PATH || line === '.devcontainer')
}

/**
 * Whether the open flow has anything to do in this window.
 *
 * **Not inside the project's container.** The flow writes the dev container
 * configuration and hands the window over; a window already connected has
 * nothing left to hand over. Until 2026-10-07 it ran there on every
 * connection, aimed at the container's path on the host, and only EACCES
 * stopped the write. Another kind of remote has no project on this machine.
 */
export function prepareHere(remoteName: string | undefined): { act: true } | { act: false; why: string } {
  if (remoteName === undefined) return { act: true }
  if (remoteName === 'dev-container') {
    return { act: false, why: "this window is already inside the project's container, so there is nothing to prepare" }
  }
  // A WSL window's project is reached through its distro — docker, files, the
  // build and the credentials each go there — so it is prepared like a local one.
  if (remoteName === 'wsl' && WSL_READY) return { act: true }
  return { act: false, why: `this window is connected to "${remoteName}", and the project is not on this machine` }
}

/** What a configuration is made from: the project, this host, and nothing else. */
export interface ConfigurationInputs {
  projectRoot: string
  homeDir: string
  extensionVersion: string
  facts: HostFacts
  manifest: string | null
  gradleBuilds: GradleBuild[]
}

/**
 * The configuration for this project now, and what was decided on the way.
 *
 * **One function for both writers.** Opening writes this file and, since the
 * debt configure-changes-the-limits-but-the-container-keeps-the-old-ones,
 * Configure does too. The tooling identifies a container by a hash of the
 * file, so two writers that disagreed about it would recreate the container on
 * every open — they share this rather than each assembling their own.
 */
export function configurationFor(inputs: ConfigurationInputs): {
  configuration: Configuration
  limits: LimitsRead
  warnings: string[]
  log: string[]
} {
  const limits = readLimits(inputs.manifest ?? '{}', inputs.facts.cpuCount)
  const gradle = gradleVersion(inputs.gradleBuilds)
  return {
    limits,
    warnings: gradle.warnings,
    log: gradle.log,
    configuration: buildConfiguration({
      projectRoot: inputs.projectRoot,
      homeDir: inputs.homeDir,
      extensionVersion: inputs.extensionVersion,
      limits: limits.limits,
      facts: inputs.facts,
      gradleVersion: gradle.version,
      // An id that is not an id's shape is decideOpen's refusal; here it
      // keeps the folder's names rather than inventing others.
      id: (() => { const r = projectId(inputs.manifest); return r.ok ? r.id : undefined })(),
    }),
  }
}

/** The file's bytes. Shared so that "the same configuration" means the same bytes. */
export function serialise(configuration: Configuration): string {
  return `${JSON.stringify(configuration, null, 2)}\n`
}

export interface RegenerationInputs extends ConfigurationInputs {
  existingConfig: string | null
}

export type Regeneration =
  | { action: 'write'; serialised: string; notes: string[]; log: string[] }
  | { action: 'keep'; why: string }

/**
 * What Configure does to the configuration after writing the manifest.
 *
 * **Why it exists.** The limits reach the container only as runArgs in this
 * file, and only opening wrote it — so Configure, then Rebuild Container, came
 * back with the old memory (reported 2026-10-22). Configure already rebuilds
 * the image, which also takes effect only when the container is recreated, so
 * the limits now change at the same moment as everything else.
 *
 * **What it refuses**, each for a cost the open flow already names: a file this
 * extension did not write, because it is gitignored and nothing could recover
 * it; and a manifest that cannot be read, because writing defaults nobody asked
 * for is how a project ends up with 6 GiB and no explanation.
 */
export function regenerateConfiguration(inputs: RegenerationInputs): Regeneration {
  if (inputs.existingConfig !== null && !isOurs(inputs.existingConfig)) {
    return {
      action: 'keep',
      why:
        `\`${CONFIG_PATH}\` was not written by this extension, so it was left as it is and the new ` +
        `limits are not in it. Move it aside and open the project to have it generated.`,
    }
  }
  if (inputs.manifest === null) {
    return { action: 'keep', why: `there is no manifest \`${MANIFEST}\` to take the limits from.` }
  }
  const built = configurationFor(inputs)
  if (built.limits.refusal !== undefined) {
    return {
      action: 'keep',
      why:
        `the manifest \`${MANIFEST}\` carries ${built.limits.refusal}, so \`${CONFIG_PATH}\` was ` +
        `left as it is.`,
    }
  }
  if (built.limits.limits.usedDefaults) {
    return {
      action: 'keep',
      why: `the manifest \`${MANIFEST}\` could not be read, so \`${CONFIG_PATH}\` was left as it is.`,
    }
  }
  return { action: 'write', serialised: serialise(built.configuration), notes: built.warnings, log: built.log }
}

/** The credentials directory under a home, in that home's own separator. */
function credentialsDir(home: string): string {
  return home.startsWith('\\\\') ? `${home}\\.claude` : `${home}/.claude`
}

/**
 * The image's state from the two questions imageState asks docker: inspect the
 * image, and when that fails, whether a daemon answers at all.
 *
 * **A docker that cannot be started is its own state** (story
 * without-docker-desktop-opening-is-refused-naming-what-is-missing): "install
 * it" and "start it" are different instructions, and collapsing them is how a
 * person is told to start something they do not have.
 */
export function imageStateFrom(inspect: 'ok' | Error, version: 'ok' | Error | undefined): ImageState {
  if (inspect === 'ok') return 'present'
  if (version === 'ok') return 'absent'
  const missing = (e: unknown) =>
    e instanceof Error && ((e as NodeJS.ErrnoException).code === 'ENOENT' || /not found|No such file/i.test(e.message))
  if (missing(inspect) && missing(version)) return 'no-docker'
  return 'unknown'
}

/** A running container as the open reads it: its name, its Dev Containers folder label, and every mount. */
export interface ContainerRow {
  name: string
  /** `devcontainer.local_folder`, or empty for a container Dev Containers did not start. */
  localFolder: string
  /** Volume names and bind sources, as docker lists them. */
  mounts: string[]
}

/** The format runningContainers asks `docker ps` for, read by containersFrom. */
export const CONTAINERS_FORMAT = '{{.Names}}\t{{.Label "devcontainer.local_folder"}}\t{{.Mounts}}'

/**
 * `docker ps --no-trunc --format CONTAINERS_FORMAT`, as rows. **`--no-trunc`
 * is load-bearing**: without it docker cuts the mounts (`gam2-probe-a-v…`,
 * measured on 26.1.5) and no volume name would ever match. Mounts are split on
 * commas; a volume name holds none, and a bind source that does only splits
 * into pieces that are not this project's volume.
 */
export function containersFrom(stdout: string): ContainerRow[] {
  return stdout
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => {
      const [name = '', localFolder = '', mounts = ''] = l.split('\t')
      return { name: name.trim(), localFolder, mounts: mounts.split(',').map((m) => m.trim()).filter((m) => m !== '') }
    })
}
