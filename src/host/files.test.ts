import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { filesFor, wslFileArgv, type Exec } from './files.ts'

/**
 * Debt a-running-distro-is-reported-as-not-answering: from Windows, a WSL
 * project's files were reached at \\wsl.localhost\..., and VS Code restricts
 * UNC access from the extension host — even with the host allow-listed, as the
 * operator found on 2026-10-22. Every access now goes through the distro
 * itself (chosen over allow-listing and over vscode.workspace.fs).
 */

const wsl = { kind: 'wsl', distro: 'archlinux', path: '\\\\wsl.localhost\\archlinux\\home\\h\\p', linux: '/home/h/p' } as const

// --- the shell never sees the path or the content as code -------------------

test('every distro operation is a fixed script, with the path as an argument and the content on input', () => {
  for (const op of ['read', 'write', 'exists', 'mkdir', 'remove'] as const) {
    const a = wslFileArgv('archlinux', op, '/home/h/p/a b\'$(rm -rf ~)".json')
    assert.equal(a.command, 'wsl.exe')
    assert.deepEqual(a.args.slice(0, 5), ['-d', 'archlinux', '--exec', 'sh', '-c'])
    const script = a.args[5] ?? ''
    assert.ok(!script.includes('rm -rf'), `${op}: the path reached the script: ${script}`)
    assert.equal(a.args[6], 'sh', op)
    assert.equal(a.args[7], '/home/h/p/a b\'$(rm -rf ~)".json', op)
  }
})

test('a write goes to a temporary file and is moved into place, so a failure leaves no truncated file', () => {
  const script = wslFileArgv('archlinux', 'write', '/x').args[5] ?? ''
  assert.match(script, /cat > "\$tmp"/)
  assert.match(script, /mv -f "\$tmp" "\$1"/)
})

// --- absent is not an error, and an error is not absent ------------------------

type Call = { command: string; args: string[]; input?: string }
const fake = (answer: (c: Call) => { status: number; stdout?: string; stderr?: string }) => {
  const calls: Call[] = []
  const exec: Exec = (command, args, input) => {
    const c = { command, args, input }
    calls.push(c)
    const a = answer(c)
    return { status: a.status, stdout: a.stdout ?? '', stderr: a.stderr ?? '' }
  }
  return { exec, calls }
}

test('a file that is not there reads as null', () => {
  const { exec } = fake(() => ({ status: 3 }))
  assert.equal(filesFor(wsl, exec).read('.agent-container.stack.json'), null)
})

test('a file that is there reads as its contents, from the Linux path', () => {
  const { exec, calls } = fake(() => ({ status: 0, stdout: '{"java":"21"}\n' }))
  assert.equal(filesFor(wsl, exec).read('.agent-container.stack.json'), '{"java":"21"}\n')
  assert.equal(calls[0]?.args[7], '/home/h/p/.agent-container.stack.json')
})

test('a distro that fails is an error naming it and what it said, never read as "no manifest"', () => {
  const { exec } = fake(() => ({ status: 1, stderr: 'wsl: the distribution could not be launched' }))
  assert.throws(() => filesFor(wsl, exec).read('.agent-container.stack.json'), /archlinux.*could not be launched/)
})

test('a write sends the content on input and fails loudly', () => {
  const { exec, calls } = fake(() => ({ status: 0 }))
  filesFor(wsl, exec).write('.devcontainer/devcontainer.json', '{"x":1}\n')
  assert.equal(calls[0]?.input, '{"x":1}\n')
  assert.equal(calls[0]?.args[7], '/home/h/p/.devcontainer/devcontainer.json')
  const failing = fake(() => ({ status: 1, stderr: 'Permission denied' }))
  assert.throws(() => filesFor(wsl, failing.exec).write('x', 'y'), /archlinux.*Permission denied/)
})

test('exists and mkdir answer through the distro', () => {
  const { exec } = fake((c) => ({ status: (c.args[5] ?? '').startsWith('[ -e') ? 1 : 0 }))
  assert.equal(filesFor(wsl, exec).exists('docs/PLANNING'), false)
  assert.doesNotThrow(() => filesFor(wsl, exec).mkdirAbsolute('/home/h/.claude'))
})

// --- a local project is the filesystem, as before ------------------------------

test('a local project reads and writes its own folder, and never runs anything', () => {
  const root = mkdtempSync(join(tmpdir(), 'files-'))
  const { exec, calls } = fake(() => ({ status: 99 }))
  const f = filesFor({ kind: 'host', path: root }, exec)
  assert.equal(f.read('m.json'), null)
  f.write('a/b.json', 'x\n')
  assert.equal(readFileSync(join(root, 'a/b.json'), 'utf8'), 'x\n')
  writeFileSync(join(root, 'm.json'), 'y')
  assert.equal(f.read('m.json'), 'y')
  assert.equal(f.exists('a'), true)
  assert.deepEqual(calls, [])
})

// --- listing a folder (story the-study-view) ----------------------------------
//
// The Study view lists docs/study/. A WSL project is listed through the distro,
// with the same fixed script and the path as an argument, never through a UNC
// path or a shell line built from the folder's name.

test('a WSL project lists a folder through a fixed script, the path as an argument', () => {
  const calls: { command: string; args: string[] }[] = []
  const exec = (command: string, args: string[]) => {
    calls.push({ command, args })
    return { status: 0, stdout: 'a-topic\nb topic\n.gitignore\n', stderr: '' }
  }
  const files = filesFor({ kind: 'wsl', distro: 'Ubuntu', path: '\\\\wsl.localhost\\Ubuntu\\p', linux: '/home/me/p' }, exec)
  assert.deepEqual(files.list('docs/study'), ['.gitignore', 'a-topic', 'b topic'])
  assert.equal(calls[0]?.command, 'wsl.exe')
  assert.equal(calls[0]?.args.at(-1), '/home/me/p/docs/study')
  assert.ok(!(calls[0]?.args.slice(0, -1).join(' ') ?? '').includes('docs/study'))
})

test('listing a folder that is not there gives null, and any other failure throws', () => {
  const absent = filesFor({ kind: 'wsl', distro: 'Ubuntu', path: 'u', linux: '/p' }, () => ({ status: 3, stdout: '', stderr: '' }))
  assert.equal(absent.list('docs/study'), null)
  const broken = filesFor({ kind: 'wsl', distro: 'Ubuntu', path: 'u', linux: '/p' }, () => ({ status: 1, stdout: '', stderr: 'boom' }))
  assert.throws(() => broken.list('docs/study'), /boom/)
})

test('a host project lists a folder from its disk, and null when it is not there', () => {
  const root = mkdtempSync(join(tmpdir(), 'files-list-'))
  mkdirSync(join(root, 'docs/study/b'), { recursive: true })
  mkdirSync(join(root, 'docs/study/a'))
  const files = filesFor({ kind: 'host', path: root })
  assert.deepEqual(files.list('docs/study'), ['a', 'b'])
  assert.equal(files.list('docs/nowhere'), null)
})

// --- a file removed, here or in the distro (story d27.1, task d27.1.1)
//
// Turning ai-memory off removes the project's .ai-memory.toml, and nothing else.

test('remove deletes a file on this machine, and a file already gone is not an error', () => {
  const root = mkdtempSync(join(tmpdir(), 'files-remove-'))
  writeFileSync(join(root, '.ai-memory.toml'), 'x')
  const files = filesFor({ kind: 'host', path: root })
  files.remove('.ai-memory.toml')
  assert.equal(files.exists('.ai-memory.toml'), false)
  files.remove('.ai-memory.toml')
})

test('remove in a distro is rm -f there, on the Linux path, and a failure names the distro', () => {
  const calls: string[][] = []
  const ok: Exec = (command, args) => { calls.push([command, ...args]); return { status: 0, stdout: '', stderr: '' } }
  filesFor(wsl, ok).remove('.ai-memory.toml')
  assert.equal(calls.length, 1)
  assert.match(calls[0]![6] ?? '', /rm -f/)
  assert.equal(calls[0]!.at(-1), '/home/h/p/.ai-memory.toml')
  const no: Exec = () => ({ status: 1, stdout: '', stderr: 'Read-only file system' })
  assert.throws(() => filesFor(wsl, no).remove('.ai-memory.toml'), /archlinux.*Read-only file system/)
})
