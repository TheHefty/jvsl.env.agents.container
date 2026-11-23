import * as vscode from 'vscode'

import { handsOver } from '../build/build.ts'
import { buildInTerminal } from '../build/command.ts'
import { dockerPath } from '../build/devcontainer.ts'
import { readLimits } from '../build/limits.ts'
import { MEMORY_MARKER } from '../configure/switches.ts'
import { filesFor } from '../host/files.ts'
import { dockerFor } from '../host/docker.ts'
import { factsFor } from '../host/host.ts'
import { mountPath } from '../host/locate.ts'
import { imageState } from '../open/command.ts'
import { CONFIG_PATH } from '../open/open.ts'
import { BRAINSTORM_IMAGE, brainstormConfiguration, planBrainstorm } from './brainstorm.ts'
import { brainstormPlace, openTarget } from './place.ts'

/**
 * Brainstorm: open the ideation container on the developer's ideas folder
 * (story the-brainstorm-command-opens-the-ideation-container, gh-364; task
 * 5kd.2.3). On Windows, in the default WSL distro (task 5kd.2.4); where is
 * brainstormPlace's to decide, and a distro that does not answer is refused.
 *
 * It writes the configuration and the memory marker into the ideas folder
 * (planBrainstorm decides what), builds core alone under the Brainstorm
 * image's name when the image is not there, and opens the folder in a window
 * told to reopen it in its container — never to prepare it as a project.
 * A second run writes nothing, builds nothing, and Dev Containers finds the
 * same container by the same configuration.
 */
export async function brainstorm(
  write: (lines: string[]) => void,
  extensionPath: string,
  extensionVersion: string,
  handOver: (folder: string) => Thenable<void>,
): Promise<void> {
  const refuse = (why: string): void => {
    write([`brainstorm: refused — ${why}`])
    void vscode.window.showErrorMessage(`Brainstorm: ${why}`)
  }
  const place = await brainstormPlace()
  if (!place.ok) {
    refuse(place.reason)
    return
  }
  const { project, home } = place
  const ideasDir = project.path
  const files = filesFor(project)
  try {
    files.mkdirAbsolute(mountPath(project))
  } catch (error) {
    refuse(`the ideas folder ${ideasDir} could not be created: ${String(error)}`)
    return
  }

  const docker = dockerFor(project)
  const measured = await factsFor(project, docker).catch((error: unknown) => {
    write([`brainstorm: facts: docker could not be asked (${String(error)})`])
    return { facts: { cpuCount: 1, devicesPresent: [], devicesAbsent: [] }, notes: [] }
  })
  write(measured.notes.map((n) => `brainstorm: facts: ${n}`))
  const configuration = brainstormConfiguration({
    ideasDir: dockerPath(mountPath(project)),
    homeDir: home,
    extensionVersion,
    // No manifest: the defaults every new project starts with.
    limits: readLimits('{}', measured.facts.cpuCount).limits,
    facts: measured.facts,
  })

  let plan: ReturnType<typeof planBrainstorm>
  try {
    plan = planBrainstorm({ configuration, existingConfig: files.read(CONFIG_PATH), markerPresent: files.exists(MEMORY_MARKER) })
  } catch (error) {
    refuse(`the ideas folder could not be read: ${String(error)}`)
    return
  }
  if ('refused' in plan) {
    refuse(plan.refused)
    return
  }
  try {
    for (const w of plan.writes) {
      files.write(w.rel, w.text)
      write([`brainstorm: wrote ${w.rel} in ${ideasDir}`])
    }
  } catch (error) {
    refuse(`the ideas folder could not be written: ${String(error)}`)
    return
  }

  const image = await imageState(BRAINSTORM_IMAGE, write, docker)
  if (image === 'no-docker' || image === 'unknown') {
    refuse(`docker did not answer, so whether ${BRAINSTORM_IMAGE} exists is unknown. Nothing was built.`)
    return
  }
  if (image === 'absent') {
    write([`brainstorm: building ${BRAINSTORM_IMAGE} from core alone`])
    const outcome = await buildInTerminal(project, extensionPath, write, { image: BRAINSTORM_IMAGE })
    if (!handsOver(outcome)) return
  }

  await handOver(ideasDir)
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.from(openTarget(project)), {
    forceNewWindow: vscode.workspace.workspaceFolders !== undefined,
  })
}
