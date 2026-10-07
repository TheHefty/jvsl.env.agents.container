import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { planFileMigration, type ProjectFiles } from './migrate-files.ts'
import { projectNames } from './devcontainer.ts'

// The pre-commit fahrenheit404 and gosnip carry, byte for byte (measured on
// 2026-10-07: the two are identical).
const LEGACY_HOOK = readFileSync(new URL('./fixtures/legacy-pre-commit', import.meta.url), 'utf8')

const CLAUDE = [
  '# CLAUDE.md', '', 'Project guidance.', '',
  'The normative documents live inside the `.code-server/` submodule, which is empty until', 'initialised.', '',
  '@.code-server/docs/agent/en/MODES.md', '@docs/RULES.md', '', '## Our own rules', 'Keep it short.', '',
].join('\n')
const RULES = ['# Rules', '', '@../.code-server/docs/agent/en/RULES.md', '', '---', '', '## This project', 'Be kind.', ''].join('\n')

const project = (over: Partial<ProjectFiles> = {}): ProjectFiles => ({
  hasSubmodule: true,
  legacyManifest: '{\n  "java": "21",\n  "limits": { "memory": "8g" }\n}\n',
  currentManifest: null,
  texts: new Map([
    ['CLAUDE.md', CLAUDE], ['docs/RULES.md', RULES], ['AGENTS.md', 'Agents read `.code-server/docs/agent/en/MODES.md` by hand.\n'],
    ['.githooks/pre-commit', LEGACY_HOOK], ['README.md', 'Plain readme.\n'],
  ]),
  ...over,
})

const op = (plan: ReturnType<typeof planFileMigration>, path: string) =>
  plan.kind === 'plan' ? plan.ops.find((o) => 'path' in o && o.path === path) : undefined

test('a project on neither half of the template has nothing to migrate', () => {
  const p = planFileMigration(project({ hasSubmodule: false, legacyManifest: null }))
  assert.equal(p.kind, 'nothing')
})

test('the submodule is removed, and nothing is committed', () => {
  const p = planFileMigration(project())
  assert.ok(p.kind === 'plan')
  assert.ok(p.ops.some((o) => o.kind === 'remove-submodule' && o.path === '.code-server'))
  assert.ok(!p.ops.some((o) => (o.kind as string) === 'commit'))
})

test('the manifest keeps every stack and limit, gains beads, and the old name goes', () => {
  const p = planFileMigration(project())
  const w = op(p, '.agent-container.stack.json')
  assert.ok(w && w.kind === 'write')
  assert.deepEqual(JSON.parse(w.content), { java: '21', limits: { memory: '8g' }, beads: true })
  assert.ok(op(p, '.code-server.stack.json')?.kind === 'remove')
})

test('only the import lines are removed; every other byte stays', () => {
  const p = planFileMigration(project())
  const claude = op(p, 'CLAUDE.md'); const rules = op(p, 'docs/RULES.md')
  assert.ok(claude?.kind === 'write' && rules?.kind === 'write')
  assert.equal(claude.content, CLAUDE.replace('@.code-server/docs/agent/en/MODES.md\n', ''))
  assert.equal(rules.content, RULES.replace('@../.code-server/docs/agent/en/RULES.md\n', ''))
  assert.equal(op(p, 'README.md'), undefined, 'a file with nothing to change is not written')
})

test('prose that mentions the submodule is listed with file and line, and not rewritten', () => {
  const p = planFileMigration(project())
  assert.ok(p.kind === 'plan')
  assert.deepEqual(p.report.mentions.map((m) => `${m.path}:${m.line}`).sort(), ['AGENTS.md:1', 'CLAUDE.md:5'])
  assert.equal(op(p, 'AGENTS.md'), undefined)
})

test('the known pre-commit is rewritten to call check-md-size from PATH', () => {
  const hook = op(planFileMigration(project()), '.githooks/pre-commit')
  assert.ok(hook?.kind === 'write')
  assert.ok(!hook.content.includes('.code-server'))
  assert.match(hook.content, /exec check-md-size --root "\$HERE\/\.\."/)
})

test('a pre-commit in another shape is left alone and listed', () => {
  const odd = '#!/bin/sh\nbash .code-server/scripts/check-md-size.sh\n'
  const p = planFileMigration(project({ texts: new Map([['.githooks/pre-commit', odd]]) }))
  assert.ok(p.kind === 'plan')
  assert.equal(op(p, '.githooks/pre-commit'), undefined)
  assert.ok(p.report.mentions.some((m) => m.path === '.githooks/pre-commit'))
})

test('the migrated hook passes with check-md-size on PATH, and names the cause without it', () => {
  const hook = op(planFileMigration(project()), '.githooks/pre-commit')
  assert.ok(hook?.kind === 'write')
  const dir = mkdtempSync(join(tmpdir(), 'hook-'))
  mkdirSync(join(dir, '.githooks')); mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, '.githooks/pre-commit'), hook.content); chmodSync(join(dir, '.githooks/pre-commit'), 0o755)
  writeFileSync(join(dir, 'bin/check-md-size'), '#!/bin/sh\necho "ran $*"\n'); chmodSync(join(dir, 'bin/check-md-size'), 0o755)
  const run = (path: string) => {
    try {
      return { code: 0, out: execFileSync('bash', [join(dir, '.githooks/pre-commit')], { env: { PATH: path }, encoding: 'utf8', stdio: 'pipe' }) }
    } catch (e) {
      const err = e as { status: number; stderr: string }
      return { code: err.status, out: err.stderr }
    }
  }
  const withIt = run(`${join(dir, 'bin')}:/usr/bin:/bin`)
  assert.equal(withIt.code, 0); assert.match(withIt.out, /ran --root/)
  const without = run('/usr/bin:/bin')
  assert.equal(without.code, 1); assert.match(without.out, /check-md-size is not on PATH/)
})

test('the plan writes files before it removes the submodule, so a failure never leaves neither format', () => {
  const p = planFileMigration(project())
  assert.ok(p.kind === 'plan')
  const kinds = p.ops.map((o) => o.kind)
  assert.ok(kinds.lastIndexOf('write') < kinds.indexOf('remove-submodule'))
  assert.match(p.report.undo, /git restore --staged --worktree/)
})

test('the data volume is named for the repository, so the move keeps it', () => {
  assert.equal(projectNames('/home/jv/Projetos/jvsl.monorepo.agents.gosnip').volume, 'jvsl.monorepo.agents.gosnip-code-server-data')
})

test('history and the planning that moves to the tracker are not listed as mentions', () => {
  const texts = new Map([
    ['CHANGELOG.md', '- bumped .code-server to v3\n'],
    ['docs/PLANNING/e/s/OVERVIEW.md', 'see .code-server/docs\n'],
    ['docs/DEBTS/d/OVERVIEW.md', 'the .code-server submodule\n'],
    ['README.md', 'Clone with .code-server.\n'],
  ])
  const p = planFileMigration(project({ texts }))
  assert.ok(p.kind === 'plan')
  assert.deepEqual(p.report.mentions.map((m) => m.path), ['README.md'])
})

// --- applying the plan to a real repository with a real submodule ----------

import { applyFileMigration } from './migrate-files.ts'
import { existsSync } from 'node:fs'

test('applying the plan removes the submodule and its .gitmodules entry, writes the files, and commits nothing', async () => {
  const sh = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'protocol.file.allow=always', ...args], { cwd, encoding: 'utf8', stdio: 'pipe' })
  const base = mkdtempSync(join(tmpdir(), 'migrate-'))
  const tpl = join(base, 'template'); const root = join(base, 'project')
  mkdirSync(tpl); sh(tpl, 'init', '-q'); writeFileSync(join(tpl, 'x'), 'x'); sh(tpl, 'add', '.'); sh(tpl, 'commit', '-qm', 't')
  mkdirSync(root); sh(root, 'init', '-q')
  sh(root, 'submodule', 'add', '-q', tpl, '.code-server')
  writeFileSync(join(root, '.code-server.stack.json'), '{"java":"21"}\n')
  writeFileSync(join(root, 'CLAUDE.md'), CLAUDE)
  sh(root, 'add', '.'); sh(root, 'commit', '-qm', 'old format')
  const head = sh(root, 'rev-parse', 'HEAD')

  const plan = planFileMigration(project({ texts: new Map([['CLAUDE.md', CLAUDE]]), legacyManifest: '{"java":"21"}\n' }))
  assert.ok(plan.kind === 'plan')
  await applyFileMigration(root, plan)

  assert.equal(sh(root, 'rev-parse', 'HEAD'), head, 'nothing committed')
  assert.ok(!existsSync(join(root, '.code-server', 'x')), 'the submodule is gone')
  assert.ok(!readFileSync(join(root, '.gitmodules'), 'utf8').includes('.code-server'), 'its .gitmodules entry is gone')
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.agent-container.stack.json'), 'utf8')), { java: '21', beads: true })
  assert.ok(!existsSync(join(root, '.code-server.stack.json')))
  assert.ok(!readFileSync(join(root, 'CLAUDE.md'), 'utf8').includes('@.code-server/'))
})

test('a manifest the extension already renamed still gains beads, and the submodule still goes', () => {
  // The extension adopts .code-server.stack.json on first opening a project,
  // so a project opened before its migration arrives with the current name,
  // no "beads": true, and the submodule still there.
  const p = planFileMigration(project({ legacyManifest: null, currentManifest: '{\n  "node": "22"\n}\n' }))
  assert.ok(p.kind === 'plan')
  const w = op(p, '.agent-container.stack.json')
  assert.ok(w && w.kind === 'write')
  assert.deepEqual(JSON.parse(w.content), { node: '22', beads: true })
  assert.equal(op(p, '.code-server.stack.json'), undefined, 'there is no old file to remove')
})

import { carriesTemplateSubmodule, textsWorthReading } from './migrate-files.ts'

test('a .gitmodules with the template is the old format; one without it is not', () => {
  assert.equal(carriesTemplateSubmodule('[submodule ".code-server"]\n\tpath = .code-server\n\turl = x\n'), true)
  assert.equal(carriesTemplateSubmodule('[submodule "vendor/lib"]\n\tpath = vendor/lib\n'), false)
  assert.equal(carriesTemplateSubmodule(null), false)
})

test('the files read for the plan are text, and never the submodule\'s own', () => {
  assert.deepEqual(
    textsWorthReading(['CLAUDE.md', '.githooks/pre-commit', '.code-server/docs/x.md', 'logo.png', 'docs/RULES.md', 'a.ts']),
    ['CLAUDE.md', '.githooks/pre-commit', 'docs/RULES.md', 'a.ts'],
  )
})

// --- found in gosnip PR #10: the generated devcontainer was committed --------

test('the plan ignores .devcontainer/ when .gitignore does not, keeping every existing line', () => {
  const p = planFileMigration(project({ gitignore: '.ai-jail\n.claude/settings.local.json\n' }))
  const w = op(p, '.gitignore')
  assert.ok(w && w.kind === 'write')
  assert.ok(w.content.startsWith('.ai-jail\n.claude/settings.local.json\n'))
  assert.match(w.content, /^\.devcontainer\/$/m)
})

test('a .gitignore that already ignores the devcontainer is left alone', () => {
  for (const gitignore of ['.devcontainer/\n', 'x\n.devcontainer\n', '/.devcontainer/\n']) {
    assert.equal(op(planFileMigration(project({ gitignore })), '.gitignore'), undefined, gitignore)
  }
})

test('a tracked devcontainer is untracked, never deleted', () => {
  const p = planFileMigration(project({ gitignore: '', trackedDevcontainer: true }))
  assert.ok(p.kind === 'plan')
  assert.ok(p.ops.some((o) => o.kind === 'untrack' && o.path === '.devcontainer'))
  assert.ok(!p.ops.some((o) => o.kind === 'remove' && o.path.startsWith('.devcontainer')))
})

test('applying an untrack takes the devcontainer out of the index and leaves it on disk', async () => {
  const root = mkdtempSync(join(tmpdir(), 'untrack-'))
  const g = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: root, encoding: 'utf8', stdio: 'pipe' })
  g('init', '-q'); mkdirSync(join(root, '.devcontainer'))
  writeFileSync(join(root, '.devcontainer/devcontainer.json'), '{"workspaceMount":"source=/home/someone"}')
  writeFileSync(join(root, '.code-server.stack.json'), '{}'); g('add', '.'); g('commit', '-qm', 'x')
  const plan = planFileMigration({ hasSubmodule: false, legacyManifest: '{}', currentManifest: null, texts: new Map(), gitignore: '', trackedDevcontainer: true })
  assert.ok(plan.kind === 'plan')
  await applyFileMigration(root, plan)
  assert.ok(existsSync(join(root, '.devcontainer/devcontainer.json')), 'still on disk')
  assert.equal(g('ls-files', '.devcontainer').trim(), '', 'out of the index')
  assert.equal(g('status', '--porcelain', '--', '.devcontainer').trim().startsWith('D'), true, 'staged as removed from the index')
  assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /^\.devcontainer\/$/m)
})
