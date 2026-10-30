import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import Module from 'node:module'
import { join } from 'node:path'

/**
 * Loads the built bundle for real, with `vscode` stubbed.
 *
 * The point is not the exports: it is that an incomplete bundle throws
 * module-not-found at *activation*, inside the editor, as a notification naming
 * a path and no cause — the extension looks installed and does nothing. Loading
 * it here turns that into a failed build.
 *
 * `vscode` is marked external in the bundle because the editor provides it, so
 * requiring the bundle outside an editor fails on that import unless something
 * answers for it. The loader hook below is that something. It does not prove
 * activation succeeds in an editor; the story's @manual pass is what does.
 */
const BUNDLE = join(import.meta.dirname, '..', 'dist', 'extension.cjs')

type Loader = (this: unknown, request: string, parent: unknown, isMain: boolean) => unknown
const internals = Module as unknown as { _load: Loader }
const original = internals._load

internals._load = function (this: unknown, request, parent, isMain) {
  if (request === 'vscode') {
    return {
      window: { createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }) },
      workspace: { workspaceFolders: undefined },
      commands: { registerCommand: () => ({ dispose() {} }) },
      env: { remoteName: undefined },
    }
  }
  return original.call(this, request, parent, isMain)
}

test('the bundle loads and exposes the activation entry point', () => {
  const require = createRequire(import.meta.url)
  const loaded = require(BUNDLE) as { activate?: unknown; deactivate?: unknown }
  assert.equal(typeof loaded.activate, 'function', 'the editor calls activate() and nothing else')
  assert.equal(typeof loaded.deactivate, 'function')
})

test('the bundle does not carry the editor API inside it', () => {
  // vscode must stay external: bundling it would ship a copy of an API the
  // editor injects, and the copy wins.
  // Read with an imported binding: these files load as ES modules, where a
  // bare `require` is simply not defined — which is how this assertion failed
  // the first time, blaming the bundle for a mistake in the test.
  const source = readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('require("vscode")'), 'vscode should be required, not inlined')
})

test('activation registers every contributed command, each under its own id', async () => {
  // **The editor refuses a second registration of one id, and so does this
  // stub.** From 8ce33ad (2026-10-04) until this test, PICK and OPEN were both
  // 'jvsl.agentContainer.open'. The second registerCommand threw inside
  // activate(), so build and configure were never registered. The editor
  // logged "command 'jvsl.agentContainer.open' already exists", and every
  // palette entry answered "not found". #110, #111 and #114 each fixed
  // something real near that symptom. None of them was the cause, because
  // no test called activate().
  const registered = new Set<string>()
  const noop = { dispose() {} }
  internals._load = function (this: unknown, request, parent, isMain) {
    if (request === 'vscode') {
      return {
        window: {
          createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
          registerTreeDataProvider: () => noop,
          showWarningMessage: () => Promise.resolve(undefined),
          showInformationMessage: () => Promise.resolve(undefined),
        },
        workspace: {
          workspaceFolders: undefined,
          createFileSystemWatcher: () => ({ onDidCreate: () => noop, onDidChange: () => noop, onDidDelete: () => noop, dispose() {} }),
          getConfiguration: () => ({ get: () => undefined }),
        },
        commands: {
          registerCommand: (id: string) => {
            if (registered.has(id)) throw new Error(`command '${id}' already exists`)
            registered.add(id)
            return noop
          },
          executeCommand: () => Promise.resolve(undefined),
        },
        extensions: { all: [] },
        env: { remoteName: undefined },
        EventEmitter: class { event = () => noop; fire() {} dispose() {} },
        TreeItem: class {},
        ThemeIcon: class {},
        TreeItemCollapsibleState: { None: 0 },
        Uri: { file: (p: string) => ({ fsPath: p }) },
      }
    }
    return original.call(this, request, parent, isMain)
  }

  const require = createRequire(import.meta.url)
  delete require.cache[BUNDLE]
  const loaded = require(BUNDLE) as { activate: (context: unknown) => Promise<void> }
  const context = { subscriptions: [], extensionPath: join(import.meta.dirname, '..'), globalState: { get: () => undefined, update: () => Promise.resolve(undefined) } }
  await loaded.activate(context)

  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as {
    contributes: { commands: { command: string }[] }
  }
  const missing = manifest.contributes.commands.map((c) => c.command).filter((id) => !registered.has(id))
  assert.deepEqual(missing, [], 'contributed in package.json but never registered by activate()')
})

// --- opening a folder writes nothing (story opening-a-folder-writes-nothing) --
//
// `code <folder>` activated the extension on workspaceContains, and startup()
// renamed an old manifest and wrote .devcontainer, CLAUDE.md and AGENTS.md.
// Driven at the level it was found: the built bundle, activated in a window
// whose folder is a real project on disk.

/** What a test can give the stubbed editor: answers to notices, and what it records. */
interface EditorScript {
  /** The action a notice is answered with, by its text; undefined dismisses it. */
  answer?: (message: string) => string | undefined
  /** Every command the extension executes. */
  executed?: string[]
  /** What getCommands reports as available. */
  commands?: string[]
  /** Every line written to the extension's output channel. */
  channel?: string[]
  /** The project's workspaceState, kept by the test so it outlives an activation. */
  workspaceState?: Map<string, unknown>
  /** What inspect() answers for a setting, by its full key, and every update() made. */
  inspect?: Record<string, unknown>
  updates?: Array<[string, unknown, unknown]>
  /** The window's remote, and its folder's address, for a window that is not local. */
  remoteName?: string
  folderUri?: { fsPath: string; authority: string; path: string; scheme: string }
  /** Every command the extension registers, so a test can run one. */
  registered?: Map<string, (...args: unknown[]) => unknown>
  /** What the folder picker returns. */
  openDialog?: unknown[]
  /** Every executeCommand, with its arguments. */
  calls?: unknown[][]
  /** Answer every question with its default: no stacks, the first option, the box's value. */
  defaults?: boolean
}

function stubEditor(folder: string, handedOver: unknown, updates: unknown[], messages: string[] = [], script: EditorScript = {}) {
  const noop = { dispose() {} }
  const say = (m: string) => { messages.push(m); return Promise.resolve(script.answer?.(m)) }
  internals._load = function (this: unknown, request, parent, isMain) {
    if (request === 'vscode') {
      return {
        window: {
          createOutputChannel: () => ({ appendLine(l: string) { script.channel?.push(l) }, show() {}, dispose() {} }),
          registerTreeDataProvider: () => noop,
          showWarningMessage: say,
          showInformationMessage: say,
          showErrorMessage: say,
          showOpenDialog: () => Promise.resolve(script.openDialog),
          // A question asked is answered like Escape, unless the test asks for the defaults.
          showQuickPick: (items: unknown, o?: { canPickMany?: boolean }) =>
            Promise.resolve(!script.defaults ? undefined : o?.canPickMany ? [] : Array.isArray(items) ? items[0] : undefined),
          showInputBox: (o?: { value?: string }) => Promise.resolve(script.defaults ? o?.value ?? '' : undefined),
        },
        workspace: {
          workspaceFolders: [{ uri: script.folderUri ?? { fsPath: folder, authority: '' } }],
          createFileSystemWatcher: () => ({ onDidCreate: () => noop, onDidChange: () => noop, onDidDelete: () => noop, dispose() {} }),
          getConfiguration: (section?: string) => ({
            get: () => undefined,
            inspect: (k: string) => script.inspect?.[`${section}.${k}`],
            update: (k: string, v: unknown, t: unknown) => { script.updates?.push([`${section}.${k}`, v, t]); return Promise.resolve(undefined) },
          }),
        },
        ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
        commands: {
          registerCommand: (id: string, cb: (...args: unknown[]) => unknown) => { script.registered?.set(id, cb); return noop },
          executeCommand: (c: string, ...args: unknown[]) => { script.executed?.push(c); script.calls?.push([c, ...args]); return Promise.resolve(undefined) },
          getCommands: () => Promise.resolve(script.commands ?? []),
        },
        extensions: { all: [] },
        env: { remoteName: script.remoteName },
        EventEmitter: class { event = () => noop; fire() {} dispose() {} },
        TreeItem: class {},
        ThemeIcon: class {},
        TreeItemCollapsibleState: { None: 0 },
        Uri: { file: (p: string) => ({ fsPath: p }) },
      }
    }
    return original.call(this, request, parent, isMain)
  }
  const require = createRequire(import.meta.url)
  delete require.cache[BUNDLE]
  const loaded = require(BUNDLE) as { activate: (context: unknown) => Promise<void> }
  const context = {
    subscriptions: [],
    extensionPath: join(import.meta.dirname, '..'),
    globalState: { get: () => handedOver, update: (_k: string, v: unknown) => { updates.push(v); return Promise.resolve(undefined) } },
    workspaceState: {
      get: (k: string) => script.workspaceState?.get(k),
      update: (k: string, v: unknown) => { script.workspaceState?.set(k, v); return Promise.resolve(undefined) },
    },
  }
  return loaded.activate(context)
}

const settle = () => new Promise((r) => setTimeout(r, 1500))

// --- a stale configuration is said, and nothing is written
// (debt a-projects-generated-container-configuration-does-not-follow-an-upgraded-extension)
//
// Found on 2026-10-28: a project whose devcontainer.json an extension of 1.3.2
// had written kept it through an upgrade to 1.8.0 and a rebuild, so the host's
// timezone never reached its container, and nothing said why. Driven where it
// was found: the built bundle, activated in a window opened on that project.

test('a configuration an older extension generated is said once, offering to regenerate it, and left as it was', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stale-config-'))
  writeFileSync(join(dir, '.agent-container.stack.json'), '{"stacks":[]}\n')
  mkdirSync(join(dir, '.devcontainer'))
  const old = `${JSON.stringify({ image: 'x-dev', containerEnv: { PUID: '1000', PGID: '1000' }, 'x-jvsl-generated': { extension: '1.3.2' } }, null, 2)}\n`
  writeFileSync(join(dir, '.devcontainer', 'devcontainer.json'), old)
  const messages: string[] = []
  await stubEditor(dir, undefined, [], messages)
  await settle()
  const said = messages.filter((m) => m.includes('devcontainer.json'))
  assert.equal(said.length, 1, JSON.stringify(messages))
  assert.match(said[0] ?? '', /1\.3\.2.*Regenerate/s)
  assert.equal(readFileSync(join(dir, '.devcontainer', 'devcontainer.json'), 'utf8'), old, 'nothing written until Regenerate is chosen')
})

test('a configuration of the current generation says nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'current-config-'))
  writeFileSync(join(dir, '.agent-container.stack.json'), '{"stacks":[]}\n')
  mkdirSync(join(dir, '.devcontainer'))
  writeFileSync(join(dir, '.devcontainer', 'devcontainer.json'), JSON.stringify({ image: 'x-dev', 'x-jvsl-generated': { extension: '0.0.1', generation: 2 } }))
  const messages: string[] = []
  await stubEditor(dir, undefined, [], messages)
  await settle()
  assert.deepEqual(messages.filter((m) => m.includes('devcontainer.json')), [])
})

function legacyProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'opened-folder-'))
  writeFileSync(join(dir, '.code-server.stack.json'), '{"node":"22"}\n')
  return dir
}

test('opening a project folder writes nothing to it', async () => {
  const dir = legacyProject()
  const before = readdirSync(dir).sort()
  await stubEditor(dir, undefined, [])
  await settle()
  assert.deepEqual(readdirSync(dir).sort(), before, 'no file written, renamed or removed by activation alone')
})

test('a folder Open or Create handed over is prepared, and the handover is consumed', async () => {
  const dir = legacyProject()
  const updates: unknown[] = []
  await stubEditor(dir, { folder: dir, at: Date.now() }, updates)
  await settle()
  assert.ok(existsSync(join(dir, '.agent-container.stack.json')), 'prepared: the old manifest was adopted')
  assert.ok(updates.includes(undefined), 'the handover was consumed')
})

// --- a regenerated configuration reaches the container (debt
// regenerate-reopens-the-window-but-the-container-keeps-its-old-configuration)
//
// Found on 2026-10-28 on 1.9.0: Regenerate rewrote devcontainer.json and
// reopened, Dev Containers reattached to the existing container, and the new
// configuration reached nothing until a Rebuild Container by hand. Driven
// where it was found: the built bundle, in a window on a project with a stale
// configuration, with a docker on PATH that reports the project's container.
// Dev Containers itself cannot be driven here; what the extension hands it is
// the claim.

const REOPEN = 'remote-containers.reopenInContainer'
const REBUILD = 'remote-containers.rebuildAndReopenInContainer'

function staleProjectWithContainer(): { dir: string; restore: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'regenerate-'))
  writeFileSync(join(dir, '.agent-container.stack.json'), '{"stacks":[]}\n')
  mkdirSync(join(dir, '.devcontainer'))
  writeFileSync(join(dir, '.devcontainer', 'devcontainer.json'),
    `${JSON.stringify({ image: 'x-dev', containerEnv: { PUID: '1000', PGID: '1000' }, 'x-jvsl-generated': { extension: '1.3.2' } }, null, 2)}\n`)
  const bin = join(dir, '.fake-bin')
  mkdirSync(bin)
  // The calls preparing and reading the container make, answered as a daemon
  // with the image built and one container created for this folder.
  writeFileSync(join(bin, 'docker'), [
    '#!/bin/sh',
    'case "$*" in',
    '  "info --format {{.NCPU}}") echo 4 ;;',
    '  "version --format {{.Server.Version}}") echo 27.0.0 ;;',
    '  "image inspect -f {{.Id}} "*) echo sha256:new ;;',
    '  "image inspect "*) echo "[{}]" ;;',
    '  "ps -a --filter"*) printf "abc\\tproj-ctr\\t%s\\trunning\\n" "$FAKE_PROJECT" ;;',
    '  "inspect -f {{.Image}} abc") echo sha256:old ;;',
    'esac',
  ].join('\n'), { mode: 0o755 })
  const path = process.env.PATH
  process.env.PATH = `${bin}:${path ?? ''}`
  process.env.FAKE_PROJECT = dir
  return { dir, restore: () => { process.env.PATH = path; delete process.env.FAKE_PROJECT } }
}

async function until(done: () => boolean, ms = 8000) {
  const end = Date.now() + ms
  while (!done() && Date.now() < end) await new Promise((r) => setTimeout(r, 100))
}

test('Regenerate with a container already there asks to recreate it, and Recreate runs the rebuild (debt o81)', async () => {
  const { dir, restore } = staleProjectWithContainer()
  try {
    const messages: string[] = []
    const executed: string[] = []
    await stubEditor(dir, undefined, [], messages, {
      answer: (m) => (m.includes('Regenerate') ? 'Regenerate' : m.includes('old configuration') ? 'Recreate container' : undefined),
      executed,
      commands: [REOPEN, REBUILD],
    })
    await until(() => executed.length > 0)
    assert.ok(messages.some((m) => /proj-ctr.*old configuration/s.test(m)), JSON.stringify(messages))
    assert.deepEqual(executed, [REBUILD], 'recreated through the rebuild, not reattached with a reopen')
    assert.match(readFileSync(join(dir, '.devcontainer', 'devcontainer.json'), 'utf8'), /"generation"/)
  } finally {
    restore()
  }
})

test('dismissing the question recreates nothing, and the channel says what waits', async () => {
  const { dir, restore } = staleProjectWithContainer()
  try {
    const messages: string[] = []
    const executed: string[] = []
    const channel: string[] = []
    await stubEditor(dir, undefined, [], messages, {
      answer: (m) => (m.includes('Regenerate') ? 'Regenerate' : undefined),
      executed,
      commands: [REOPEN, REBUILD],
      channel,
    })
    await until(() => messages.some((m) => m.includes('old configuration')))
    await settle()
    assert.deepEqual(executed, [], 'nothing recreated, nor reattached to the old container')
    assert.ok(channel.some((l) => /waits for .*Rebuild Container/.test(l)), JSON.stringify(channel))
  } finally {
    restore()
  }
})

// --- the wrapperless-build warning reaches a project that is only opened
// (debt rjj, task rjj.3)
//
// Found in kotodori on 2026-10-29 with 1.12.2: rjj.2's warning lived only in
// prepare, and opening an existing project does not prepare, so it never
// showed. Driven where it was found: the built bundle, in a window opened on a
// project with a current configuration and a build-logic with no wrapper.

function openedGradleProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gradle-notice-'))
  writeFileSync(join(dir, '.agent-container.stack.json'), '{"stacks":["java"]}\n')
  mkdirSync(join(dir, '.devcontainer'))
  writeFileSync(join(dir, '.devcontainer', 'devcontainer.json'), JSON.stringify({ image: 'x-dev', 'x-jvsl-generated': { extension: '0.0.1', generation: 99 } }))
  for (const b of ['2-backend/core', '2-backend/build-logic']) {
    mkdirSync(join(dir, b), { recursive: true })
    writeFileSync(join(dir, b, 'settings.gradle.kts'), '')
  }
  mkdirSync(join(dir, '2-backend/core/gradle/wrapper'), { recursive: true })
  writeFileSync(join(dir, '2-backend/core/gradle/wrapper/gradle-wrapper.properties'),
    'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.3-bin.zip\n')
  return dir
}

const gradleNotice = (m: string) => m.includes('`2-backend/build-logic`') && m.includes('gradle wrapper --gradle-version 8.14.3')

test('opening a project with a wrapperless Gradle build shows the warning, naming the build and the wrapper that fixes it', async () => {
  const dir = openedGradleProject()
  const messages: string[] = []
  await stubEditor(dir, undefined, [], messages, { workspaceState: new Map() })
  await until(() => messages.some(gradleNotice))
  assert.ok(messages.some(gradleNotice), JSON.stringify(messages))
})

test('the same warning is not shown again on the next open, and still reaches the channel; a changed one is', async () => {
  const dir = openedGradleProject()
  const state = new Map<string, unknown>()
  await stubEditor(dir, undefined, [], [], { workspaceState: state })
  await settle()

  const again: string[] = []
  const channel: string[] = []
  await stubEditor(dir, undefined, [], again, { workspaceState: state, channel })
  await settle()
  assert.deepEqual(again.filter(gradleNotice), [], 'shown once, not at every open')
  assert.ok(channel.some((l) => l.includes('2-backend/build-logic')), JSON.stringify(channel))

  mkdirSync(join(dir, 'tools/plugin'), { recursive: true })
  writeFileSync(join(dir, 'tools/plugin/settings.gradle'), '')
  const changed: string[] = []
  await stubEditor(dir, undefined, [], changed, { workspaceState: state })
  await until(() => changed.some((m) => m.includes('`tools/plugin`')))
  assert.ok(changed.some((m) => m.includes('`tools/plugin`')), JSON.stringify(changed))
})

// --- on Windows, Dev Containers' Wayland mount is turned off (debt chf, task chf.1)
//
// Found on 2026-10-30: a project on the Windows filesystem did not open through
// Docker Desktop, because Dev Containers mounted WSLg's Wayland socket from a
// WSL distro Docker Desktop could not reach. Driven at activation, since the
// person may reopen through Dev Containers' own command and never through ours.
// CI is Linux, so the platform is the seam.

function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T>): Promise<T> {
  const was = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: platform })
  return run().finally(() => Object.defineProperty(process, 'platform', was))
}

function windowsProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wayland-'))
  writeFileSync(join(dir, '.agent-container.stack.json'), '{"stacks":[]}\n')
  mkdirSync(join(dir, '.devcontainer'))
  writeFileSync(join(dir, '.devcontainer', 'devcontainer.json'), JSON.stringify({ image: 'x-dev', 'x-jvsl-generated': { extension: '0.0.1', generation: 99 } }))
  return dir
}

const WAYLAND = 'dev.containers.mountWaylandSocket'

test('activated on Windows for a project there, the extension turns the Wayland mount off and says so', async () => {
  const updates: Array<[string, unknown, unknown]> = []
  const messages: string[] = []
  const channel: string[] = []
  await withPlatform('win32', async () => {
    await stubEditor(windowsProject(), undefined, [], messages, { inspect: { [WAYLAND]: { key: WAYLAND, defaultValue: true } }, updates, channel })
    await until(() => updates.length > 0)
  })
  assert.deepEqual(updates, [[WAYLAND, false, 1]], 'turned off in the user settings')
  assert.ok(messages.some((m) => m.includes('mountWaylandSocket')), JSON.stringify(messages))
  assert.ok(channel.some((l) => l.includes('mountWaylandSocket')), JSON.stringify(channel))
})

test('on Linux, the same project leaves the setting untouched', async () => {
  const updates: Array<[string, unknown, unknown]> = []
  await stubEditor(windowsProject(), undefined, [], [], { inspect: { [WAYLAND]: { key: WAYLAND, defaultValue: true } }, updates })
  await settle()
  assert.deepEqual(updates, [])
})

// --- Open, from a WSL window, keeps the folder in its distro (debt ck8, task ck8.1)
//
// Found on 2026-10-30: Open kept only the picked folder's fsPath and opened
// Uri.file of it, so the project left WSL for Windows' Docker. Driven where it
// was found: the built bundle's Open command, in a window connected to WSL,
// with the picker returning a vscode-remote address. A wsl.exe on PATH runs the
// distro's script here and logs it, so the manifest check is seen going there.

test('Open from a WSL window opens the picked folder by its own address, checking it through the distro', async () => {
  const linux = mkdtempSync(join(tmpdir(), 'wsl-picked-'))
  writeFileSync(join(linux, '.agent-container.stack.json'), '{"stacks":[]}\n')
  const bin = mkdtempSync(join(tmpdir(), 'fake-wsl-'))
  const log = join(bin, 'calls')
  writeFileSync(join(bin, 'wsl.exe'), ['#!/bin/sh', `printf '%s\\n' "$*" >> '${log}'`, 'shift 3', 'exec "$@"'].join('\n'), { mode: 0o755 })
  const path = process.env.PATH
  process.env.PATH = `${bin}:${path ?? ''}`
  try {
    const picked = { scheme: 'vscode-remote', authority: 'wsl+archlinux', path: linux, fsPath: linux.replace(/\//g, '\\'), toString: () => `vscode-remote://wsl+archlinux${linux}` }
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    const calls: unknown[][] = []
    await stubEditor(linux, undefined, [], [], {
      remoteName: 'wsl',
      folderUri: { scheme: 'vscode-remote', authority: 'wsl+archlinux', path: '/home/heftier/another', fsPath: '\\home\\heftier\\another' },
      registered, calls, openDialog: [picked],
    })
    await registered.get('jvsl.agentContainer.open')!()
    const open = calls.find((c) => c[0] === 'vscode.openFolder')
    assert.ok(open, JSON.stringify(calls))
    assert.equal(open[1], picked, 'opened with the picked address itself, not Uri.file of a path')
    assert.match(readFileSync(log, 'utf8'), /-d archlinux --exec sh -c/, 'the manifest was looked for in the distro')
  } finally {
    process.env.PATH = path
  }
})

// --- Create, from a WSL window, writes the project in its distro (debt ck8, task ck8.2)
//
// Found on 2026-10-30: Create from a WSL window checked and wrote the bare Linux
// path on the Windows disk (C:\\home\\...), and opened Uri.file of it. Driven
// through the built bundle's Create command in a WSL-shaped window, with the
// picker returning a vscode-remote address and a wsl.exe on PATH that runs the
// distro's script here and logs it. The test runs in a scratch directory, so a
// write made with the mangled path lands there and is seen.

test('Create from a WSL window writes through the distro and opens the picked address', async () => {
  const linux = join(mkdtempSync(join(tmpdir(), 'wsl-create-')), 'new-project')
  const bin = mkdtempSync(join(tmpdir(), 'fake-wsl-'))
  const log = join(bin, 'calls')
  writeFileSync(join(bin, 'wsl.exe'), ['#!/bin/sh', `printf '%s\\n' "$*" >> '${log}'`, 'shift 3', 'exec "$@"'].join('\n'), { mode: 0o755 })
  const scratch = mkdtempSync(join(tmpdir(), 'wsl-create-cwd-'))
  const path = process.env.PATH
  const cwd = process.cwd()
  process.env.PATH = `${bin}:${path ?? ''}`
  process.chdir(scratch)
  try {
    const fsPath = linux.replace(/\//g, '\\')
    const picked = { scheme: 'vscode-remote', authority: 'wsl+archlinux', path: linux, fsPath, toString: () => `vscode-remote://wsl+archlinux${linux}` }
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    const calls: unknown[][] = []
    await stubEditor(scratch, undefined, [], [], {
      remoteName: 'wsl',
      folderUri: { scheme: 'vscode-remote', authority: 'wsl+archlinux', path: '/home/heftier/another', fsPath: '\\home\\heftier\\another' },
      registered, calls, openDialog: [picked], defaults: true,
    })
    await registered.get('jvsl.agentContainer.create')!()
    const open = calls.find((c) => c[0] === 'vscode.openFolder')
    assert.ok(open, JSON.stringify(calls))
    assert.equal(open[1], picked, 'opened with the picked address itself')
    assert.match(readFileSync(log, 'utf8'), /-d archlinux --exec sh -c mkdir -p/, 'the scaffold went through the distro')
    assert.ok(existsSync(join(linux, '.agent-container.stack.json')), 'and is where the distro put it')
    assert.deepEqual(readdirSync(scratch), [], 'nothing was written with the Windows reading of the path')
  } finally {
    process.chdir(cwd)
    process.env.PATH = path
  }
})

test('Create from a WSL window refuses a distro folder that already holds something', async () => {
  const linux = mkdtempSync(join(tmpdir(), 'wsl-occupied-'))
  writeFileSync(join(linux, 'README.md'), 'mine\n')
  const bin = mkdtempSync(join(tmpdir(), 'fake-wsl-'))
  writeFileSync(join(bin, 'wsl.exe'), ['#!/bin/sh', 'shift 3', 'exec "$@"'].join('\n'), { mode: 0o755 })
  // In a scratch directory, so a write made with the Windows reading of the path lands there.
  const scratch = mkdtempSync(join(tmpdir(), 'wsl-occupied-cwd-'))
  const path = process.env.PATH
  const cwd = process.cwd()
  process.env.PATH = `${bin}:${path ?? ''}`
  process.chdir(scratch)
  try {
    const picked = { scheme: 'vscode-remote', authority: 'wsl+archlinux', path: linux, fsPath: linux.replace(/\//g, '\\'), toString: () => `vscode-remote://wsl+archlinux${linux}` }
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    const calls: unknown[][] = []
    const messages: string[] = []
    await stubEditor(linux, undefined, [], messages, {
      remoteName: 'wsl',
      folderUri: { scheme: 'vscode-remote', authority: 'wsl+archlinux', path: '/home/heftier/another', fsPath: '\\home\\heftier\\another' },
      registered, calls, openDialog: [picked], defaults: true,
    })
    await registered.get('jvsl.agentContainer.create')!()
    assert.equal(calls.some((c) => c[0] === 'vscode.openFolder'), false, 'nothing opened')
    assert.ok(messages.some((m) => m.includes('README.md')), JSON.stringify(messages))
    assert.deepEqual(readdirSync(scratch), [], 'nothing was written with the Windows reading of the path')
  } finally {
    process.chdir(cwd)
    process.env.PATH = path
  }
})

// --- Open on the window's own folder asks for its manifest (debt y6w, task y6w.1)
//
// Found on 2026-10-30: in a window open on a folder with no manifest, Open on
// that same folder prepared it without asking the questions that write one.
// Driven through the built bundle's Open command, the questions answered by
// their defaults.

test('Open on the window\'s own folder with no manifest asks the questions, writes it, and prepares here', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'own-folder-'))
  const registered = new Map<string, (...args: unknown[]) => unknown>()
  const calls: unknown[][] = []
  const picked = { scheme: 'file', authority: '', path: dir, fsPath: dir, toString: () => `file://${dir}` }
  await stubEditor(dir, undefined, [], [], { registered, calls, openDialog: [picked], defaults: true })
  await registered.get('jvsl.agentContainer.open')!()
  assert.ok(existsSync(join(dir, '.agent-container.stack.json')), 'the manifest was written')
  assert.ok(calls.some((c) => c[0] === 'jvsl.agentContainer.prepare'), JSON.stringify(calls))
  assert.equal(calls.some((c) => c[0] === 'vscode.openFolder'), false, 'no second window onto the same folder')
})
