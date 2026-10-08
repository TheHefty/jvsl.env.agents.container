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
 * a program. Nothing reaches the process from the keyboard: what runs here
 * never asks.
 *
 * **It stays open after its process ends**, saying how it ended, and closes on
 * a key. It used to close the moment the process did: kotodori's planning step
 * refused in under a second, the refusal vanished with the terminal, and the
 * editor reported "The terminal process failed to launch (exit code: 1)" for a
 * process that had run (debt a-refusal-is-gone-before-it-can-be-read). So the
 * end of the process is `exited`, which is what a build reads its outcome
 * from, and no longer the terminal's closing.
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
  handleInput?(data: string): void
  /**
   * The process's exit code once it ends, 128 plus the signal when a signal
   * ended it, 127 when it could not start. `undefined` when the terminal was
   * closed while it still ran, which a build reads as cancelled.
   */
  exited: Promise<number | undefined>
}

/** A terminal's line endings: a bare \n moves down without returning. */
const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n')

export function hostProcessTerminal(command: string, args: readonly string[]): HostTerminal {
  const write = emitter<string>()
  const close = emitter<number | void>()
  let child: ReturnType<typeof spawn> | undefined
  let code: number | undefined
  let ended = false
  let closed = false
  let settle: (code: number | undefined) => void = () => {}
  const exited = new Promise<number | undefined>((resolve) => { settle = resolve })

  const end = (n: number, line: string) => {
    if (ended) return
    ended = true
    code = n
    settle(n)
    write.fire(crlf(`\n${line} — press any key to close\n`))
  }
  const shut = (c: number | void) => {
    if (closed) return
    closed = true
    close.fire(c)
  }

  return {
    onDidWrite: write.event,
    onDidClose: close.event,
    exited,
    open() {
      // Its own process group, so closing the terminal stops everything it
      // started, not only the first process: a `sh -c` build leaves docker
      // running otherwise, holding the output open.
      child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
      child.stdout?.on('data', (b: Buffer) => write.fire(crlf(b.toString('utf8'))))
      child.stderr?.on('data', (b: Buffer) => write.fire(crlf(b.toString('utf8'))))
      child.on('error', (e: NodeJS.ErrnoException) => {
        end(127, e.code === 'ENOENT'
          ? `${command}: not found on this host's PATH, where this extension runs. Install it, or put it on the PATH the editor starts with.`
          : `${command}: could not start: ${e.message}`)
      })
      child.on('close', (c, signal) => {
        if (closed) return
        const n = c ?? 128 + (signal ? constants.signals[signal] : 0)
        end(n, signal ? `[stopped by ${signal}: exit ${n}]` : `[exit ${n}]`)
      })
    },
    handleInput() {
      // Only once the process has ended: before that, a key is not a request
      // to close, and nothing reads it.
      if (ended) shut(code)
    },
    close() {
      // The operator closed it. While the process runs, that stops it and the
      // run reads as cancelled; afterwards there is nothing left to stop.
      if (!ended) {
        ended = true
        settle(undefined)
        if (child?.pid && child.exitCode === null) {
          try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
        }
      }
      closed = true
    },
  }
}
