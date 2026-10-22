/**
 * Which container holds a project's tracker.
 *
 * **The extension runs on the host** (measured on the operator's machine on
 * 2026-10-06), and the tracker lives in the container. Dev Containers labels
 * each container it starts with `devcontainer.local_folder=<host path>`, so the
 * host path is what finds it. In a local window that path is the workspace
 * folder. In a window connected to the container the folder is the container's
 * own `/config/workspace`, which names nothing on the host, and the host path
 * is carried in the remote authority instead.
 */

const PREFIX = 'dev-container+'

/**
 * The host path a dev container's remote authority carries.
 *
 * The payload after `dev-container+` is hex, and decodes either to the path
 * itself or to a JSON object with `hostPath`. Both are handled. A dev container
 * reached through another remote carries that one after an `@`. Anything else
 * decodes to nothing, never to a guess, because a wrong path shows another
 * project's work.
 */
export function hostPathFromAuthority(authority: string): string | undefined {
  if (!authority.startsWith(PREFIX)) return undefined
  const payload = authority.slice(PREFIX.length).split('@')[0] ?? ''
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(payload)) return undefined
  const decoded = Buffer.from(payload, 'hex').toString('utf8')
  let path: unknown = decoded
  if (decoded.startsWith('{')) {
    try {
      path = (JSON.parse(decoded) as Record<string, unknown>)['hostPath']
    } catch {
      return undefined
    }
  }
  return typeof path === 'string' && path.startsWith('/') ? path : undefined
}

export interface Running {
  id: string
  name: string
  localFolder: string
}

export type Choice = { kind: 'one'; id: string } | { kind: 'none' } | { kind: 'many'; names: string[] }

const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)

/**
 * The running container for a project. **Exact match only**: a prefix of
 * another project's path is that other project. Two matches are refused by
 * name rather than chosen between.
 */
export function containerFor(hostPath: string, running: readonly Running[]): Choice {
  const want = trim(hostPath)
  const matches = running.filter((r) => trim(r.localFolder) === want)
  if (matches.length === 0) return { kind: 'none' }
  if (matches.length === 1) return { kind: 'one', id: matches[0]!.id }
  return { kind: 'many', names: matches.map((m) => m.name) }
}

export type ProjectOnHost =
  | { kind: 'host'; path: string }
  /**
   * A project inside a WSL distro, seen from an editor on Windows. **`path` is
   * where this machine reads and writes its files**, as it is for a local
   * project — here `\\wsl.localhost\<distro>\...` — so every file access
   * goes on reading `path`. `linux` is the same folder inside the distro, which
   * is what the distro's docker mounts: see mountPath.
   */
  | { kind: 'wsl'; distro: string; path: string; linux: string }
  | { kind: 'none'; reason: string }

/**
 * Whether a WSL project is used, rather than only located.
 *
 * **False until every story of the epic a-windows-editor-opens-a-project-that-
 * lives-in-wsl has landed.** Each goes through the distro in its own pull
 * request — docker and the machine's facts, the files, the build, the
 * credentials — and a WSL project accepted before all of them would run
 * Windows' docker against a Linux path, or bind the Windows home into a Linux
 * container. Locating comes first; using is switched on last, in one place.
 */
export const WSL_READY = false

/** The location as the commands may use it: a WSL one only once the epic is complete. */
export function onThisMachine(project: ProjectOnHost): ProjectOnHost {
  if (project.kind !== 'wsl' || WSL_READY) return project
  return {
    kind: 'none',
    reason:
      `this window's project is in the WSL distro "${project.distro}" (${project.linux}). ` +
      `Opening projects that live in WSL is not supported yet; it arrives with the epic ` +
      `a-windows-editor-opens-a-project-that-lives-in-wsl`,
  }
}

/**
 * The project's folder **on the host**, where this extension runs
 * (`extensionKind: ["ui"]`), for every command that reads or writes project
 * files.
 *
 * In a window connected to the project's container the workspace folder is the
 * container's own `/config/workspace`, which names nothing here. Every command
 * but the board used it anyway until 2026-10-07: the open flow tried to create
 * `/config/workspace/.devcontainer` on the host and only EACCES stopped it, the
 * panel said "Not configured yet", and the image check looked for
 * `workspace-dev`. **A remote this cannot trace resolves to none**, with the
 * reason, never to a guess: a wrong path is a write into somebody else's folder.
 */
export function projectOnHost(input: {
  remoteName: string | undefined
  /** `path` is the URI's path, which is the Linux path in a WSL window. */
  folder: { fsPath: string; authority: string; path?: string } | undefined
}): ProjectOnHost {
  const { remoteName, folder } = input
  if (folder === undefined) return { kind: 'none', reason: 'no folder is open' }
  if (remoteName === undefined) return { kind: 'host', path: folder.fsPath }
  if (remoteName === 'dev-container') {
    const path = hostPathFromAuthority(folder.authority)
    return path === undefined
      ? { kind: 'none', reason: `this window's address (${folder.authority}) did not decode to a folder on this machine` }
      : { kind: 'host', path }
  }
  if (remoteName === 'wsl') return wslProject(folder.authority, folder.path)
  return {
    kind: 'none',
    reason: `this window is connected to "${remoteName}", whose files are not on this machine, where the extension runs`,
  }
}

/**
 * A WSL window's folder: the distro from the authority (`wsl+<distro>`,
 * percent-encoded) and the Linux path from the URI's path. **Never from
 * fsPath**, which on Windows reads `\\home\\...` for a remote URI. Anything that
 * does not decode is none, with what was seen: a wrong distro or path is a
 * write into somebody else's folder.
 */
function wslProject(authority: string, path: string | undefined): ProjectOnHost {
  const match = /^wsl\+(.+)$/.exec(authority)
  let distro: string | undefined
  try {
    distro = match?.[1] === undefined ? undefined : decodeURIComponent(match[1])
  } catch {
    distro = undefined
  }
  if (distro === undefined || distro === '') {
    return { kind: 'none', reason: `this WSL window's address (${authority}) names no distro` }
  }
  if (path === undefined || !path.startsWith('/')) {
    return { kind: 'none', reason: `this WSL window's folder has no Linux path (${path ?? 'none'})` }
  }
  const unc = `\\\\wsl.localhost\\${distro}${path.replace(/\//g, '\\')}`
  return { kind: 'wsl', distro, path: unc, linux: path }
}

/**
 * The folder as docker sees it, for the workspace mount and the configuration:
 * the Linux path inside a distro, and the folder itself anywhere else.
 */
export function mountPath(project: Exclude<ProjectOnHost, { kind: 'none' }>): string {
  return project.kind === 'wsl' ? project.linux : project.path
}

/**
 * A WSL project whose files this machine cannot reach — the distro stopped,
 * removed, or renamed — is refused here, by name. Left alone, every read would
 * return null, which the open flow takes for "no manifest" and fills with
 * defaults.
 */
export function reachable(project: ProjectOnHost, exists: (path: string) => boolean): ProjectOnHost {
  if (project.kind !== 'wsl' || exists(project.path)) return project
  return {
    kind: 'none',
    reason:
      `the WSL distro "${project.distro}" does not answer at ${project.path} for ${project.linux}. ` +
      `Start it (wsl -d ${project.distro}) and try again`,
  }
}
