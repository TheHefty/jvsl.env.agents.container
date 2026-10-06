import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
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
} as Loader

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
          showWarningMessage: async () => undefined,
          showInformationMessage: async () => undefined,
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
          executeCommand: async () => undefined,
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
  } as Loader

  const require = createRequire(import.meta.url)
  delete require.cache[BUNDLE]
  const loaded = require(BUNDLE) as { activate: (context: unknown) => Promise<void> }
  const context = { subscriptions: [], extensionPath: join(import.meta.dirname, '..'), globalState: { get: () => undefined, update: async () => undefined } }
  await loaded.activate(context)

  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as {
    contributes: { commands: { command: string }[] }
  }
  const missing = manifest.contributes.commands.map((c) => c.command).filter((id) => !registered.has(id))
  assert.deepEqual(missing, [], 'contributed in package.json but never registered by activate()')
})
