import type { ProjectOnHost } from './locate.ts'

/** Dev Containers' own setting, which mounts WSLg's Wayland socket into every container. */
export const WAYLAND_SETTING = 'mountWaylandSocket'
export const WAYLAND_KEY = `dev.containers.${WAYLAND_SETTING}`

/** What VS Code's inspect() gives for a setting: only the values this reads. */
export interface Inspected {
  defaultValue?: unknown
  globalValue?: unknown
  workspaceValue?: unknown
  workspaceFolderValue?: unknown
}

export type WaylandDecision = { action: 'turn-off'; message: string } | { action: 'warn'; message: string } | { action: 'leave' }

/**
 * Whether to turn Dev Containers' Wayland mount off (debt chf, found on
 * 2026-10-30). On Windows, Dev Containers mounts the socket from the default
 * WSL distro, and Docker Desktop can bind a `\\wsl.localhost\<distro>` path only
 * through its integration with that distro: without it, `docker run` fails on
 * "accessing specified distro mount service", and a project on the Windows
 * filesystem never opens. Our image runs no graphical Wayland app, so the
 * mount buys nothing here.
 *
 * **Turned off for the person, unless they chose it.** A value they set to
 * true anywhere is theirs: it is left, and they are told. A WSL project uses
 * the distro's own Docker, Linux and macOS have no such mount problem, and a
 * window with no project is not ours to change.
 */
export function waylandWorkaround(input: {
  platform: NodeJS.Platform
  project: ProjectOnHost
  setting: Inspected | undefined
}): WaylandDecision {
  const { platform, project, setting } = input
  if (platform !== 'win32' || project.kind !== 'host') return { action: 'leave' }
  const chosen = [setting?.workspaceFolderValue, setting?.workspaceValue, setting?.globalValue].find((v) => v !== undefined)
  if (chosen === false) return { action: 'leave' }
  if (chosen === true) {
    return {
      action: 'warn',
      message: `${WAYLAND_KEY} is set to true, so Dev Containers mounts the Wayland socket from the default WSL distro, ` +
        "which Docker Desktop cannot reach without its integration with that distro: opening this project fails on " +
        `"accessing specified distro mount service". Set ${WAYLAND_KEY} to false, or remove it, to open it.`,
    }
  }
  return {
    action: 'turn-off',
    message: `Turned ${WAYLAND_KEY} off in your user settings. On Windows, Dev Containers mounted the Wayland socket ` +
      "from the default WSL distro, which Docker Desktop cannot reach, and that stopped this project's container from " +
      'starting. Nothing in this container uses Wayland.',
  }
}
