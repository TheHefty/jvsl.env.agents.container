import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { ProjectOnHost } from './locate.ts'

/**
 * A project's own files, read and written where they live.
 *
 * **A WSL project's files go through the distro, never through
 * `\\wsl.localhost`** (debt a-running-distro-is-reported-as-not-answering).
 * VS Code restricts UNC access from the extension host, and on the operator's
 * machine on 2026-10-22 it went on refusing with `wsl.localhost` in
 * `security.allowedUNCHosts` — reported upstream as an allow list the extension
 * host does not honour (microsoft/vscode#184989). So the extension asked a
 * running distro for its files and was told, wrongly, that it did not answer.
 * Each operation is now `wsl.exe -d <distro> --exec sh -c <fixed script> sh
 * <path>`: the script never changes, the path is an argument, and a write's
 * content arrives on input — nothing a folder or a file can hold is read as a
 * command. Files written this way belong to the distro's user.
 *
 * **Synchronous on purpose.** The callers are synchronous, the operations are
 * a handful at open and at Configure, and each is bounded; making a dozen call
 * sites asynchronous to save tens of milliseconds was weighed and not done.
 *
 * The extension's own files — core/, stacks/, assets/ — are not this module's:
 * they are on the editor's machine and are read there.
 */
export interface ProjectFiles {
  /** A file's contents, or null when it is not there. Any other failure throws, naming it. */
  read(rel: string): string | null
  /** Written whole, through a temporary file moved into place. */
  write(rel: string, text: string): void
  exists(rel: string): boolean
  /** A folder's entries, sorted, hidden ones included; null when the folder is not there. */
  list(rel: string): string[] | null
  /** An absolute directory, as this project's machine names it (the credentials directory). */
  mkdirAbsolute(path: string): void
  /** A file removed; one already gone is not an error. Never a directory (story d27.1). */
  remove(rel: string): void
}

export type Exec = (command: string, args: string[], input?: string) => { status: number | null; stdout: string; stderr: string }

const TIMEOUT_MS = 15_000

export const defaultExec: Exec = (command, args, input) => {
  const r = spawnSync(command, args, { input, encoding: 'utf8', timeout: TIMEOUT_MS, windowsHide: true })
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.error ? String(r.error) : (r.stderr ?? ''),
  }
}

/** Exit status the read script gives for a file that is not there, apart from every failure. */
const ABSENT = 3

const SCRIPTS = {
  read: `[ -e "$1" ] || exit ${ABSENT}; cat -- "$1"`,
  // A temporary file beside the target, moved over it: a write that fails
  // half-way leaves the old file, never a truncated one.
  write: 'mkdir -p -- "$(dirname -- "$1")" && tmp="$1.tmp.$$" && cat > "$tmp" && mv -f "$tmp" "$1"',
  exists: '[ -e "$1" ]',
  // A file only, and one already gone is not a failure (story d27.1).
  remove: 'rm -f -- "$1"',
  list: `[ -d "$1" ] || exit ${ABSENT}; ls -1A -- "$1"`,
  mkdir: 'mkdir -p -- "$1"',
} as const

export function wslFileArgv(distro: string, op: keyof typeof SCRIPTS, path: string): { command: string; args: string[] } {
  return { command: 'wsl.exe', args: ['-d', distro, '--exec', 'sh', '-c', SCRIPTS[op], 'sh', path] }
}

export function filesFor(project: Exclude<ProjectOnHost, { kind: 'none' }>, exec: Exec = defaultExec): ProjectFiles {
  if (project.kind === 'host') return localFiles(project.path)
  const { distro, linux } = project
  const at = (rel: string) => `${linux.replace(/\/+$/, '')}/${rel.replace(/^\/+/, '')}`
  const fail = (what: string, path: string, r: { status: number | null; stderr: string }): never => {
    throw new Error(`the WSL distro "${distro}" could not ${what} ${path}: ${r.stderr.trim() || `exit ${String(r.status)}`}`)
  }
  const run = (op: keyof typeof SCRIPTS, path: string, input?: string) => {
    const { command, args } = wslFileArgv(distro, op, path)
    return exec(command, args, input)
  }
  return {
    read(rel) {
      const path = at(rel)
      const r = run('read', path)
      if (r.status === 0) return r.stdout
      if (r.status === ABSENT) return null
      return fail('read', path, r)
    },
    write(rel, text) {
      const path = at(rel)
      const r = run('write', path, text)
      if (r.status !== 0) fail('write', path, r)
    },
    exists(rel) {
      return run('exists', at(rel)).status === 0
    },
    remove(rel) {
      const path = at(rel)
      const r = run('remove', path)
      if (r.status !== 0) fail('remove', path, r)
    },
    list(rel) {
      const path = at(rel)
      const r = run('list', path)
      if (r.status === ABSENT) return null
      if (r.status !== 0) return fail('list', path, r)
      return r.stdout.split('\n').filter((l) => l !== '').sort()
    },
    mkdirAbsolute(path) {
      const r = run('mkdir', path)
      if (r.status !== 0) fail('create', path, r)
    },
  }
}

function localFiles(root: string): ProjectFiles {
  return {
    read(rel) {
      try {
        return readFileSync(join(root, rel), 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },
    write(rel, text) {
      const target = join(root, rel)
      mkdirSync(dirname(target), { recursive: true })
      const tmp = `${target}.tmp.${process.pid}`
      writeFileSync(tmp, text, 'utf8')
      renameSync(tmp, target)
    },
    exists(rel) {
      return existsSync(join(root, rel))
    },
    remove(rel) {
      rmSync(join(root, rel), { force: true })
    },
    list(rel) {
      try {
        return readdirSync(join(root, rel)).sort()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },
    mkdirAbsolute(path) {
      mkdirSync(path, { recursive: true })
    },
  }
}
