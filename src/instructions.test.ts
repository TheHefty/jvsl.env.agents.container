import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { MARKER, isGenerated, instructionWrites } from './instructions.ts'

const assets = join(process.cwd(), 'assets', 'project')

test('a project with neither file gets both', () => {
  const root = mkdtempSync(join(tmpdir(), 'ins-'))
  const writes = instructionWrites(root, assets)
  assert.deepEqual(
    writes.map((w) => w.name).sort(),
    ['AGENTS.md', 'CLAUDE.md'],
  )
  assert.deepEqual(writes.filter((w) => w.action !== 'write'), [])
})

test("a file this extension did not write is left alone, and the refusal names it", () => {
  // Tracked in git and carrying a project's own standing answers — the
  // reference monorepo's is 20 KiB of them. Overwriting is destructive in a
  // way the generated dev container configuration is not.
  const root = mkdtempSync(join(tmpdir(), 'ins-'))
  writeFileSync(join(root, 'CLAUDE.md'), '# Ours\n\nThe mode is whatever we decided.\n')
  const writes = instructionWrites(root, assets)
  const claude = writes.find((w) => w.name === 'CLAUDE.md')
  assert.equal(claude?.action, 'keep')
  assert.match(claude?.because ?? '', /CLAUDE\.md/)
  // And the other one is still written: one person's work does not make the
  // whole pair untouchable.
  assert.equal(writes.find((w) => w.name === 'AGENTS.md')?.action, 'write')
})

test('a file this extension wrote is replaced, because that is an upgrade', () => {
  const root = mkdtempSync(join(tmpdir(), 'ins-'))
  writeFileSync(join(root, 'CLAUDE.md'), `${MARKER}\n\n# old\n`)
  const writes = instructionWrites(root, assets)
  assert.equal(writes.find((w) => w.name === 'CLAUDE.md')?.action, 'write')
})

test('the marker survives an editor that reformats, and is invisible when rendered', () => {
  // An HTML comment is the only form with both properties. A YAML front-matter
  // key renders as a table in some viewers and is reordered by formatters; a
  // trailing line is deleted by anybody tidying the end of a file.
  assert.ok(MARKER.startsWith('<!--'), MARKER)
  assert.ok(isGenerated(`${MARKER}\n# anything\n`))
  // Leading whitespace and a reflowed comment still count.
  assert.ok(isGenerated(`  <!--  jvsl.env.agents.vscode: generated.\n  more -->\n# x\n`))
})

test('the assets this extension ships are recognised as its own', () => {
  // The round trip. If the shipped file did not carry the marker, the first
  // upgrade would refuse to replace what the extension itself had written.
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    assert.ok(isGenerated(readFileSync(join(assets, name), 'utf8')), name)
  }
})

test('nothing is written when the asset directory is not there', () => {
  // An installation missing its own assets is not a project missing its
  // instructions, and writing an empty file would be worse than writing none.
  const root = mkdtempSync(join(tmpdir(), 'ins-'))
  const writes = instructionWrites(root, join(root, 'no-such-assets'))
  assert.deepEqual(writes.filter((w) => w.action === 'write'), [])
  assert.ok(writes.every((w) => (w.because ?? '').length > 0))
  assert.ok(!existsSync(join(root, 'CLAUDE.md')))
})
