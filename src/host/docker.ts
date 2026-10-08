import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/** Bounded because `docker info` hangs on an unreachable daemon rather than failing. */
export const DOCKER_CHECK_MS = 2000

export const run = promisify(execFile)

/**
 * Every call to docker, bounded.
 *
 * **An unbounded one hangs activation, and a hung activation is every command
 * reporting that it does not exist.** `docker info` was raced against a timeout
 * because it "hangs on an unreachable daemon rather than failing"; `image
 * inspect`, `version` and `ps` were not, and three of the four run inside the
 * path `activate` awaits. On 2026-10-06 the editor sat at `Activating…` for
 * ever while every palette entry answered `command 'jvsl.agentContainer.build'
 * not found` — which is what it says when it activates an extension to dispatch
 * a command and the activation never finishes.
 *
 * **One helper rather than a race at each call site.** The previous arrangement
 * had the race written out once, three lines from a call that did not get one.
 * A mechanism applied where somebody remembered is not a mechanism, and
 * `scripts/no-unbounded-docker-call.test.sh` now refuses any call that does not
 * come through here.
 *
 * It rejects on timeout rather than resolving, so callers keep the `catch` they
 * already had and a slow daemon reads as a daemon that did not answer — which
 * is what it is.
 */
export async function dockerBounded(args: string[], ms = DOCKER_CHECK_MS): Promise<{ stdout: string; stderr: string }> {
  return Promise.race([
    // 64 MiB of output: execFile's default is 1 MiB, and a whole tracker read
    // by the board can pass that, failing as "maxBuffer exceeded".
    run('docker', args, { maxBuffer: 64 * 1024 * 1024 }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ])
}
