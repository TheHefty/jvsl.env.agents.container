import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { decideOpen } from '../src/open/open.ts'

/**
 * Brings a container up from a configuration this extension generated, using
 * the reference implementation of the same specification, and asserts what the
 * **running container** got.
 *
 * Asserting the generated file instead was rejected at the story gate: it
 * proves only that we wrote what we meant to write, which is the tautology that
 * misses a field whose name is wrong and which the tooling therefore ignores in
 * silence. The spike found exactly that class of problem once already.
 *
 * The image is an `alpine` with the metadata label, so this costs seconds
 * rather than the minutes a real project image would — the same reason the
 * template's booted harness grew a stand-in.
 */

/**
 * Runs a command and, when it fails, says what it printed. `execFileSync`
 * throws an error whose message is only the command line, so the reason ends up
 * nowhere — which is the failure shape this whole project exists to avoid.
 */
const sh = (cmd: string, args: string[], cwd?: string): string => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string }
    throw new Error(
      `${cmd} ${args.join(' ')} failed\n--- stdout\n${e.stdout ?? ''}\n--- stderr\n${e.stderr ?? ''}`,
    )
  }
}

/**
 * The fixture lives inside the repository, under a gitignored `.tmp/`, rather
 * than in the system temp directory — and not for tidiness.
 *
 * Inside this project's own dev container the Docker daemon is a nested
 * rootless one, and the only path it can use as a bind source is the host bind
 * mount at the workspace root: a source under the system temp directory, or
 * anywhere else on the named volume, fails with `bind source path does not
 * exist` for a path that plainly does. Measured. Using the workspace works in
 * both places, so there is no environment variable to remember.
 */
const TMP_ROOT = join(import.meta.dirname, '..', '.tmp')

// The image name is derived from the folder's basename, so the folder has to
// be named for the image we are about to build.
const PROJECT = 'devcfix'
/** Written by the fixture image's own CMD, and by nothing else. */
const MARKER = '/tmp/image-command-ran'
const IMAGE = `${PROJECT}-dev`
const VOLUME = `${PROJECT}-code-server-data`

test('a container brought up from our configuration got the machine the manifest asked for', () => {
  mkdirSync(TMP_ROOT, { recursive: true })
  const parent = mkdtempSync(join(TMP_ROOT, 'devc-'))
  const root = join(parent, PROJECT)
  mkdirSync(root)

  let containerId = ''
  try {
    // Carries the label so the configuration can reference it by name without
    // building, which is what FR-19 requires and what the spike showed is the
    // only way image metadata is resolved at all.
    const dockerfile = join(parent, 'Dockerfile')
    //
    // Its CMD leaves a trace, which is the regression test for the defect the
    // story's first @manual pass found: for an image-based configuration the
    // tooling replaces the container's command with a sleep loop unless
    // `overrideCommand` says otherwise, and the real image's command is
    // s6-overlay. Nothing fails when it is replaced — there is simply no
    // nested Docker daemon, no ai-memory server and no cont-init, which is a
    // far worse outcome than an error.
    writeFileSync(
      dockerfile,
      'FROM alpine:3.21\n' +
        'RUN adduser -D -s /bin/sh abc\n' +
        `LABEL devcontainer.metadata='[{"remoteUser":"abc"}]'\n` +
        `CMD ["/bin/sh","-c","touch ${MARKER}; while sleep 1000; do :; done"]\n`,
    )
    sh('docker', ['build', '-q', '-f', dockerfile, '-t', IMAGE, parent])

    writeFileSync(
      join(root, '.code-server.stack.json'),
      JSON.stringify({ limits: { memory: '512m', cpus: 1 } }),
    )

    const decision = decideOpen({
      projectRoot: root,
      homeDir: homedir(),
      extensionVersion: '0.0.0-test',
      facts: { cpuCount: 8, devicesPresent: ['/dev/fuse'], devicesAbsent: ['/dev/kvm'] },
      manifest: JSON.stringify({ limits: { memory: '512m', cpus: 1 } }),
      existingConfig: null,
      runningContainers: [],
      reopenCommandAvailable: true,
  image: 'present' as const,
      // This fixture is not a real project with a submodule, so the version is
      // supplied rather than read. It is the minimum, because what this test
      // exercises is the container the configuration produces and not the
      // refusals around it — those are open.test.ts's.
      gitignore: '.devcontainer/\n',
    })
    assert.equal(decision.action, 'open')
    if (decision.action !== 'open') return

    for (const dir of decision.ensureHostDirs) mkdirSync(dir, { recursive: true })
    mkdirSync(join(root, '.devcontainer'))
    writeFileSync(
      join(root, '.devcontainer', 'devcontainer.json'),
      `${JSON.stringify(decision.configuration, null, 2)}\n`,
    )

    const up = sh('npx', ['--no-install', 'devcontainer', 'up', '--workspace-folder', root])
    const result = JSON.parse(up.trim().split('\n').at(-1) ?? '{}') as {
      outcome?: string
      containerId?: string
    }
    assert.equal(result.outcome, 'success', up)
    containerId = result.containerId ?? ''
    assert.notEqual(containerId, '', 'no container id came back')

    const inspected = JSON.parse(
      sh('docker', ['inspect', containerId]),
    ) as Array<{ HostConfig: Record<string, unknown> }>
    const host = inspected[0]?.HostConfig ?? {}

    // The limit that matters, and the reason it is affinity rather than a
    // quota: a quota is invisible to `nproc` inside the container, so anything
    // self-tuning from the CPU count oversubscribes and gets OOM-killed.
    assert.equal(host['CpusetCpus'], '0-0', JSON.stringify(host))
    assert.equal(host['Memory'], 512 * 1024 * 1024)
    assert.equal(host['MemorySwap'], 2560 * 1024 * 1024)

    const devices = (host['Devices'] as Array<{ PathOnHost?: string }> | undefined) ?? []
    assert.deepEqual(devices.map((d) => d.PathOnHost), ['/dev/fuse'])

    // Docker normalises the name it was given: `--cap-add SYS_ADMIN` comes back
    // as `CAP_SYS_ADMIN`. Asserting the form we sent would fail against a
    // container that is in fact correct.
    assert.deepEqual(host['CapAdd'], ['CAP_SYS_ADMIN'])
    // Only seccomp is echoed back. `systempaths=unconfined` is not recorded as a
    // security option at all — Docker consumes it and empties MaskedPaths and
    // ReadonlyPaths instead, which is where its effect is visible. Measured:
    // with the flag both are empty, without it they hold 28 and 5 entries.
    //
    // This is the whole argument for asserting the running container rather
    // than the file we wrote. Asserting the file would have passed and proven
    // nothing; asserting the flag we sent would have failed against a container
    // that is in fact configured correctly.
    assert.deepEqual(host['SecurityOpt'], ['seccomp=unconfined'])
    assert.deepEqual(host['MaskedPaths'], [], 'systempaths=unconfined did not take effect')
    assert.deepEqual(host['ReadonlyPaths'], [])

    // Not published: code-server runs unauthenticated in the real image, which
    // was measured, so the port is opt-in and the opt-in does not exist yet.
    assert.deepEqual(host['PortBindings'], {})

    // The image's command ran, rather than being replaced by the tooling's
    // sleep loop. In the real image that command is s6-overlay; without it the
    // container comes up with none of its services and nothing says so.
    sh('docker', ['exec', containerId, 'test', '-f', MARKER])
  } finally {
    if (containerId !== '') {
      try { sh('docker', ['rm', '-f', containerId]) } catch { /* already gone */ }
    }
    try { sh('docker', ['volume', 'rm', '-f', VOLUME]) } catch { /* never created */ }
    try { sh('docker', ['rmi', '-f', IMAGE]) } catch { /* never built */ }
    rmSync(parent, { recursive: true, force: true })
  }
})
