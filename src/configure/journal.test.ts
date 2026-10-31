import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { filesFor, type Exec } from '../host/files.ts'
import type { Home } from '../host/home.ts'
import type { ProjectOnHost } from '../host/locate.ts'
import {
  JOURNAL_CONFIG_PATH,
  journalConfigProject,
  journalFilesFor,
  normalizeJournalRepository,
  persistJournalRepository,
  readJournalRepository,
  writeJournalRepository,
} from './journal.ts'

test('journal repository input accepts owner/repo and a GitHub repository URL', () => {
  assert.deepEqual(normalizeJournalRepository('TheHefty/journal'), {
    ok: true,
    repository: 'TheHefty/journal',
  })
  assert.deepEqual(normalizeJournalRepository('https://github.com/TheHefty/journal/'), {
    ok: true,
    repository: 'TheHefty/journal',
  })
  assert.deepEqual(normalizeJournalRepository('https://github.com/TheHefty/journal.git'), {
    ok: true,
    repository: 'TheHefty/journal',
  })
})

test('blank means the local outbox, while malformed and public-looking URLs are refused', () => {
  assert.deepEqual(normalizeJournalRepository('  '), { ok: true, repository: '' })
  for (const invalid of [
    'owner',
    'owner/repo/extra',
    'http://github.com/owner/repo',
    'https://github.com/owner/repo/issues',
    'https://example.com/owner/repo',
    'https://user:password@github.com/owner/repo',
  ]) {
    assert.equal(normalizeJournalRepository(invalid).ok, false, invalid)
  }
})

test('the journal config is a developer-home file, not a project file', () => {
  const home: Home = { local: '/home/me', mount: '/home/me' }
  const project: Exclude<ProjectOnHost, { kind: 'none' }> = { kind: 'host', path: '/work/project' }
  assert.deepEqual(journalConfigProject(project, home), { kind: 'host', path: '/home/me' })
  assert.equal(JOURNAL_CONFIG_PATH, '.claude/agent-container/journal.json')
})

test('a WSL journal config is written through the distro home that the container binds', () => {
  const project: Exclude<ProjectOnHost, { kind: 'none' }> = {
    kind: 'wsl',
    distro: 'Ubuntu',
    path: '\\\\wsl.localhost\\Ubuntu\\home\\jv\\project',
    linux: '/home/jv/project',
  }
  const home: Home = { local: '/home/jv', mount: '/home/jv' }
  const calls: Array<{ command: string; args: string[]; input?: string }> = []
  const exec: Exec = (command, args, input) => {
    calls.push({ command, args, input })
    const script = args[5] ?? ''
    return { status: script.startsWith('[ -e') ? 3 : 0, stdout: '', stderr: '' }
  }
  const files = journalFilesFor(project, home, exec)
  writeJournalRepository(files, 'owner/journal')

  const write = calls.find((call) => (call.args[5] ?? '').includes('mv -f'))
  assert.ok(write)
  assert.equal(write.command, 'wsl.exe')
  assert.equal(write.args[7], '/home/jv/.claude/agent-container/journal.json')
  assert.match(write.input ?? '', /owner\/journal/)
  assert.ok(!write.args[7]?.includes('C:\\Users'))
})

test('reading, changing and clearing the repository preserves other user config fields', () => {
  const home = mkdtempSync(join(tmpdir(), 'journal-config-'))
  const files = filesFor({ kind: 'host', path: home })
  assert.equal(readJournalRepository(files), '')

  writeJournalRepository(files, 'https://github.com/owner/journal')
  assert.equal(readJournalRepository(files), 'owner/journal')
  assert.deepEqual(JSON.parse(files.read(JOURNAL_CONFIG_PATH) ?? '{}'), { repository: 'owner/journal' })

  files.write(JOURNAL_CONFIG_PATH, '{"repository":"old/journal","keep":true}\n')
  writeJournalRepository(files, 'new/journal')
  assert.deepEqual(JSON.parse(files.read(JOURNAL_CONFIG_PATH) ?? '{}'), { repository: 'new/journal', keep: true })

  writeJournalRepository(files, '')
  assert.deepEqual(JSON.parse(files.read(JOURNAL_CONFIG_PATH) ?? '{}'), { keep: true })
})

test('a cancelled prompt or a project without beads does not change the developer-global setting', () => {
  const home = mkdtempSync(join(tmpdir(), 'journal-skip-'))
  const files = filesFor({ kind: 'host', path: home })
  files.write(JOURNAL_CONFIG_PATH, '{"repository":"owner/current"}\n')

  assert.equal(persistJournalRepository(files, true, undefined), false, 'Escape is no answer')
  assert.equal(persistJournalRepository(files, false, 'owner/new'), false, 'no tracker, no journal prompt')
  assert.equal(readJournalRepository(files), 'owner/current')

  assert.equal(persistJournalRepository(files, true, ''), true, 'an explicit empty answer selects the outbox')
  assert.equal(readJournalRepository(files), '')
})

test('a malformed current config or invalid replacement is refused without overwriting it', () => {
  const home = mkdtempSync(join(tmpdir(), 'journal-invalid-'))
  const files = filesFor({ kind: 'host', path: home })
  files.write(JOURNAL_CONFIG_PATH, '{not json')
  assert.throws(() => readJournalRepository(files), /journal\.json/)
  assert.throws(() => writeJournalRepository(files, 'owner/repo'), /journal\.json/)
  assert.equal(readFileSync(join(home, JOURNAL_CONFIG_PATH), 'utf8'), '{not json')

  files.remove(JOURNAL_CONFIG_PATH)
  assert.throws(() => writeJournalRepository(files, 'https://example.com/owner/repo'), /GitHub|owner\/repo/i)
  assert.equal(files.read(JOURNAL_CONFIG_PATH), null)
})
