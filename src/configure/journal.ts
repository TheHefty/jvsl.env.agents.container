import { filesFor, type Exec, type ProjectFiles } from '../host/files.ts'
import type { Home } from '../host/home.ts'
import { uncFor, type ProjectOnHost } from '../host/locate.ts'

/** Shared developer config, bound into the image at /config/.claude. */
export const JOURNAL_CONFIG_PATH = '.claude/agent-container/journal.json'

export type JournalRepositoryResult = { ok: true; repository: string } | { ok: false; reason: string }

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/** The journal CLI stores owner/repo; accept that or a GitHub repository URL. */
export function normalizeJournalRepository(input: string): JournalRepositoryResult {
  const value = input.trim()
  if (value === '') return { ok: true, repository: '' }

  let repository = value
  if (/^https?:\/\//i.test(value)) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return invalidRepository()
    }
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'github.com' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return invalidRepository()
    }
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length !== 2) return invalidRepository()
    repository = `${parts[0]}/${parts[1]!.replace(/\.git$/i, '')}`
  } else {
    repository = value.replace(/\.git$/i, '')
  }

  return REPOSITORY.test(repository) ? { ok: true, repository } : invalidRepository()
}

function invalidRepository(): JournalRepositoryResult {
  return {
    ok: false,
    reason: 'Enter a private GitHub repository as owner/repo or https://github.com/owner/repo.',
  }
}

/** Make the developer's home the file root; a WSL home is reached through its distro. */
export function journalConfigProject(
  project: Exclude<ProjectOnHost, { kind: 'none' }>,
  home: Home,
): Exclude<ProjectOnHost, { kind: 'none' }> {
  if (project.kind === 'host') return { kind: 'host', path: home.local }
  return {
    kind: 'wsl',
    distro: project.distro,
    path: uncFor(project.distro, home.local),
    linux: home.mount,
  }
}

export function journalFilesFor(
  project: Exclude<ProjectOnHost, { kind: 'none' }>,
  home: Home,
  exec?: Exec,
): ProjectFiles {
  return filesFor(journalConfigProject(project, home), exec)
}

/** A missing file is the outbox choice; a malformed file is never overwritten silently. */
export function readJournalRepository(files: Pick<ProjectFiles, 'read'>): string {
  const raw = files.read(JOURNAL_CONFIG_PATH)
  if (raw === null) return ''

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${JOURNAL_CONFIG_PATH} is not valid JSON; fix it before changing the journal repository`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${JOURNAL_CONFIG_PATH} must be a JSON object; fix it before changing the journal repository`)
  }

  const repository = (parsed as Record<string, unknown>).repository
  if (repository === undefined || repository === null || repository === '') return ''
  if (typeof repository !== 'string') {
    throw new Error(`${JOURNAL_CONFIG_PATH} must name a repository as owner/repo`)
  }
  const normalized = normalizeJournalRepository(repository)
  if (!normalized.ok || normalized.repository === '') {
    throw new Error(`${JOURNAL_CONFIG_PATH} does not name a repository as owner/repo`)
  }
  return normalized.repository
}

/** Update only the journal destination, preserving any developer-owned fields. */
export function writeJournalRepository(
  files: Pick<ProjectFiles, 'read' | 'write' | 'remove'>,
  input: string,
): void {
  const normalized = normalizeJournalRepository(input)
  if (!normalized.ok) throw new Error(normalized.reason)

  const raw = files.read(JOURNAL_CONFIG_PATH)
  let current: Record<string, unknown> = {}
  if (raw !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`${JOURNAL_CONFIG_PATH} is not valid JSON; fix it before changing the journal repository`)
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${JOURNAL_CONFIG_PATH} must be a JSON object; fix it before changing the journal repository`)
    }
    current = parsed as Record<string, unknown>
  }

  if (normalized.repository === '') delete current.repository
  else current.repository = normalized.repository

  if (Object.keys(current).length === 0) {
    if (raw !== null) files.remove(JOURNAL_CONFIG_PATH)
    return
  }
  files.write(JOURNAL_CONFIG_PATH, `${JSON.stringify(current, null, 2)}\n`)
}

/** Do not persist a global journal choice when the tracker is off or the prompt was cancelled. */
export function persistJournalRepository(
  files: Pick<ProjectFiles, 'read' | 'write' | 'remove'>,
  beads: boolean | undefined,
  repository: string | undefined,
): boolean {
  if (beads !== true || repository === undefined) return false
  writeJournalRepository(files, repository)
  return true
}
