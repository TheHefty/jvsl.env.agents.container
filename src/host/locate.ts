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

export type ProjectOnHost = { kind: 'host'; path: string } | { kind: 'none'; reason: string }

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
  folder: { fsPath: string; authority: string } | undefined
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
  return {
    kind: 'none',
    reason: `this window is connected to "${remoteName}", whose files are not on this machine, where the extension runs`,
  }
}
