import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { IDEAS_PATH, readIdeas, preselect, stackItems } from './offer.ts'
import { parseIdea } from './contract.ts'

// --- Create offers ready ideas and pre-selects their stacks (story 5kd.5,
// gh-364; task create-offers-ready-ideas-and-preselects-their-stacks) --------
//
// The ideas are in the developer's ~/.claude/agent-container/ideas, read through
// the same files a WSL project's home is read through. The failures guarded:
// an idea that is not ready, or not readable, offered as if it were; something
// in the folder that is not an idea breaking Create; a stack or a version the
// extension does not offer pre-selected, failing the build later.

const EXAMPLES = join(import.meta.dirname, '../../core/plugin/agent-container/ideas/examples')

/** The developer's home as ProjectFiles sees it, with the examples as the ideas folder. */
function home(extra: Record<string, string | Error | null> = {}, ideas: string | null = EXAMPLES) {
  const prefix = `${IDEAS_PATH}/`
  return {
    list(rel: string): string[] | null {
      if (rel !== IDEAS_PATH || ideas === null) return null
      const names = existsSync(ideas) ? readdirSync(ideas) : []
      const added = Object.keys(extra).map((k) => k.slice(prefix.length).split('/')[0] ?? '')
      return [...new Set([...names, ...added])].sort()
    },
    read(rel: string): string | null {
      if (rel in extra) {
        const v = extra[rel]
        if (v instanceof Error) throw v
        return v ?? null
      }
      if (ideas === null || !rel.startsWith(prefix)) return null
      const path = join(ideas, rel.slice(prefix.length))
      return existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : null
    },
  }
}

test('an ideas folder that does not exist offers nothing and says nothing', () => {
  assert.deepEqual(readIdeas(home({}, null)), { ready: [], unreadable: [] })
})

test('a ready idea is offered; the other states are not, and are not named', () => {
  const { ready, unreadable } = readIdeas(home())
  assert.deepEqual(ready.map((r) => r.slug), ['ready-whole'])
  assert.equal(ready[0]?.text, readFileSync(join(EXAMPLES, 'ready-whole/IDEA.md'), 'utf8'))
  assert.ok(!unreadable.some((u) => /raw-just-started|became-a-project/.test(u)))
})

test('an idea outside the contract is not offered, and is named with what is wrong', () => {
  const { unreadable } = readIdeas(home())
  const names = JSON.parse(JSON.stringify(readdirSync(EXAMPLES))) as string[]
  const invalid = names.filter((n) => (JSON.parse(readFileSync(join(EXAMPLES, n, 'expect.json'), 'utf8')) as { valid: boolean }).valid === false)
  assert.ok(invalid.length >= 8)
  for (const n of invalid) assert.ok(unreadable.some((u) => u.startsWith(`${n}: `)), `${n} should be named: ${unreadable.join(' | ')}`)
  assert.match(unreadable.find((u) => u.startsWith('ready-without-a-stack: ')) ?? '', /## Stack/)
  assert.match(unreadable.find((u) => u.startsWith('an-unknown-key: ')) ?? '', /line 3/)
})

test('hidden entries, like the memory marker the Brainstorm command writes, are not ideas', () => {
  const { unreadable, ready } = readIdeas(home({ [`${IDEAS_PATH}/.ai-memory.toml`]: 'x' }))
  assert.equal(ready.length, 1)
  assert.ok(!unreadable.some((u) => u.includes('.ai-memory')))
})

test('a folder with no IDEA.md is named, not offered', () => {
  const { unreadable } = readIdeas(home({ [`${IDEAS_PATH}/half-made/notes.md`]: 'x' }))
  assert.ok(unreadable.some((u) => u.startsWith('half-made: ') && u.includes('no IDEA.md')))
})

test('an IDEA.md that cannot be read is named with the error, and Create goes on', () => {
  const { unreadable, ready } = readIdeas(home({ [`${IDEAS_PATH}/locked/IDEA.md`]: new Error('wsl.exe exited 1: Permission denied') }))
  assert.equal(ready.length, 1)
  assert.ok(unreadable.some((u) => u.startsWith('locked: ') && u.includes('Permission denied')))
})

test('an ideas folder that cannot be listed is said once, and offers nothing', () => {
  const files = { list: () => { throw new Error('wsl.exe timed out') }, read: () => null }
  const { ready, unreadable } = readIdeas(files)
  assert.equal(ready.length, 0)
  assert.equal(unreadable.length, 1)
  assert.match(unreadable[0] ?? '', /timed out/)
})

const versions = (stack: string): string[] => ({ node: ['18', '20', '22', '24'], python: ['3.12', '3.13'] } as Record<string, string[]>)[stack] ?? []
const ideaWith = (stacks: string): ReturnType<typeof parseIdea>['idea'] => parseIdea(`---\nstate: exploring\nstacks:\n${stacks}---\n`).idea

test("the idea's stacks are pre-selected, with the version it names when the stack offers it", () => {
  const p = preselect(ideaWith('  node: 22\n  python: undecided\n')!, ['node', 'python', 'rust'], versions)
  assert.deepEqual(p.stacks, ['node', 'python'])
  assert.deepEqual(p.versions, { node: '22' })
  assert.deepEqual(p.notes, [])
})

test('a stack the extension does not offer is not pre-selected, and is said', () => {
  const p = preselect(ideaWith('  cobol: 85\n  node: 22\n')!, ['node'], versions)
  assert.deepEqual(p.stacks, ['node'])
  assert.match(p.notes.join('\n'), /cobol/)
})

test('a version the stack does not offer is not pre-selected, and is said', () => {
  const p = preselect(ideaWith('  node: 21\n')!, ['node'], versions)
  assert.deepEqual(p.stacks, ['node'])
  assert.deepEqual(p.versions, {})
  assert.match(p.notes.join('\n'), /node 21/)
})

test('the stacks question marks the pre-selected stacks as picked, and only them', () => {
  assert.deepEqual(stackItems(['node', 'python', 'rust'], ['python']), [
    { label: 'node', picked: false },
    { label: 'python', picked: true },
    { label: 'rust', picked: false },
  ])
})
