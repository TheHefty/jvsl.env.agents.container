import { spawn } from 'node:child_process'
import { constants } from 'node:os'

/**
 * A terminal whose process runs **where this extension runs, on the host**.
 *
 * `createTerminal({ shellPath })` launches on the window's remote side: in a
 * window connected to a project's container that is inside the container, where
 * there is no docker and none of the host's paths. Found on 2026-10-07, from a
 * fresh clone of fahrenheit404: the migration's second step, run where the
 * command itself sends the operator, failed with "Path to shell executable
 * "docker" does not exist". A pseudoterminal is driven by the extension that
 * made it, so the process it shows is the one spawned here.
 *
 * Shaped as vscode.Pseudoterminal without importing vscode, so it is tested as
 * a program. Nothing reads the keyboard: what runs here never asks.
 */

type Listener<T> = (value: T) => unknown
type Event<T> = (listener: Listener<T>) => { dispose(): void }

function emitter<T>(): { event: Event<T>; fire(value: T): void } {
  const listeners = new Set<Listener<T>>()
  return {
    event: (l) => { listeners.add(l); return { dispose: () => { listeners.delete(l) } } },
    fire: (v) => { for (const l of [...listeners]) l(v) },
  }
}

export interface HostTerminal {
  onDidWrite: Event<string>
  onDidClose?: Event<number | void>
  open(initialDimensions: unknown): void
  close(): void
}

/** A terminal's line endings: a bare \n moves down without returning. */
const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n')

export function hostProcessTerminal(command: string, args: readonly string[]): HostTerminal {
  const write = emitter<string>()
  const close = emitter<number | void>()
  let child: ReturnType<typeof spawn> | undefined
  let done = false
  const finish = (code: number, line: string) => {
    if (done) return
    done = true
    write.fire(crlf(`\n${line}\n`))
    close.fire(code)
  }
  return {
    onDidWrite: write.event,
    onDidClose: close.event,
    open() {
      // Its own process group, so closing the terminal stops everything it
      // started, not only the first process: a `sh -c` build leaves docker
      // running otherwise, holding the output open.
      child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
      child.stdout?.on('data', (b: Buffer) => write.fire(crlf(b.toString('utf8'))))
      child.stderr?.on('data', (b: Buffer) => write.fire(crlf(b.toString('utf8'))))
      child.on('error', (e: NodeJS.ErrnoException) => {
        finish(127, e.code === 'ENOENT'
          ? `${command}: not found on this host's PATH, where this extension runs. Install it, or put it on the PATH the editor starts with.`
          : `${command}: could not start: ${e.message}`)
      })
      child.on('close', (code, signal) => {
        const n = code ?? 128 + (signal ? constants.signals[signal] : 0)
        finish(n, signal ? `[stopped by ${signal}: exit ${n}]` : `[exit ${n}]`)
      })
    },
    close() {
      if (done || !child?.pid || child.exitCode !== null) return
      try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
    },
  }
}
