import { MANIFEST } from './stack-manifest.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { scaffoldPlan, type ScaffoldInput } from './scaffold.ts'
import { ignoresGeneratedConfig } from './open.ts'

const assets = join(process.cwd(), 'assets', 'project')
const base: ScaffoldInput = {
  root: '/work/a-new-project',
  assetsDir: assets,
  answers: { stacks: { java: '21' }, limits: { memory: '6g' }, location: '/work/a-new-project' },
}

test('the plan is a list, so it can be written in full or reported in full', () => {
  // **The shape that answers the partial-scaffold scenario.** Five writes: if
  // the third fails, the directory is no longer empty and trying again is
  // refused by the check that was protecting it. A plan that is a list can be
  // reported in full instead.
  const plan = scaffoldPlan(base)
  assert.ok(Array.isArray(plan.writes))
  assert.deepEqual(
    plan.writes.map((w) => w.path).sort(),
    [MANIFEST, '.gitignore', 'AGENTS.md', 'CLAUDE.md'].sort(),
  )
})

test('the gitignore it writes satisfies the check that would refuse the project', () => {
  // Asserted against `ignoresGeneratedConfig` rather than against a literal, so
  // the writer and the refuser cannot drift apart. A project scaffolded without
  // this is created and then declines to open.
  const plan = scaffoldPlan(base)
  const gitignore = plan.writes.find((w) => w.path === '.gitignore')
  assert.ok(gitignore, JSON.stringify(plan.writes.map((w) => w.path)))
  assert.equal(ignoresGeneratedConfig(gitignore.contents), true)
})

test('the manifest it writes is the shape nextManifest produces', () => {
  // So a project created here and one configured later agree about what a
  // manifest looks like, rather than the creation flow inventing a second shape.
  const plan = scaffoldPlan(base)
  const manifest = plan.writes.find((w) => w.path === MANIFEST)
  const parsed: unknown = JSON.parse(manifest?.contents ?? '{}')
  assert.deepEqual(parsed, { java: '21', limits: { memory: '6g' } })
})

test('the ai-memory marker is absent unless asked for', () => {
  const without = scaffoldPlan(base)
  assert.ok(!without.writes.some((w) => w.path === '.ai-memory.toml'))

  const withIt = scaffoldPlan({ ...base, answers: { ...base.answers, aiMemory: true } })
  const marker = withIt.writes.find((w) => w.path === '.ai-memory.toml')
  assert.ok(marker, 'asked for and not planned')
  assert.match(marker.contents, /project_strategy/)
})

test('the instruction files come from the assets, not from this repository', () => {
  const plan = scaffoldPlan(base)
  const claude = plan.writes.find((w) => w.path === 'CLAUDE.md')
  assert.equal(claude?.contents, readFileSync(join(assets, 'CLAUDE.md'), 'utf8'))
  // And the marker travels, or the first upgrade would refuse to replace what
  // this extension itself wrote.
  assert.match(claude?.contents ?? '', /generated\./)
})

test('a directory that gained a file since the question is refused before anything is written', () => {
  // **The second check is the one that protects anything.** Six questions pass
  // between the first and this: a clone finishing, an editor saving, another
  // window's scaffolding.
  const root = mkdtempSync(join(tmpdir(), 'scaf-'))
  writeFileSync(join(root, 'appeared.txt'), 'x')
  const plan = scaffoldPlan({ ...base, root })
  assert.equal(plan.writes.length, 0)
  assert.match(plan.refused ?? '', /appeared\.txt/)
  assert.ok(!existsSync(join(root, MANIFEST)))
})

test('an unconfigured git identity yields no commit and a reason, not an invented author', () => {
  // git in this container fails with `Author identity unknown` unless an
  // identity is configured, and the agent's /config is a tmpfs without one.
  const planned = scaffoldPlan({ ...base, identity: undefined })
  assert.equal(planned.commit, false)
  assert.match(planned.note ?? '', /identity|user\.name/i)
  assert.doesNotMatch(planned.note ?? '', /error|failed/i)

  const withIdentity = scaffoldPlan({ ...base, identity: { name: 'A', email: 'a@b' } })
  assert.equal(withIdentity.commit, true)
})
