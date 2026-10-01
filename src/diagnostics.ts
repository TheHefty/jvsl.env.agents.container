import type { HostFacts } from './host.ts'

export interface Detected {
  templateVersion: string | null
  templateMinVersion: string
  facts: HostFacts
  runningOnHost: boolean
}

/**
 * What was found, as lines for the output channel: the decisions' inputs, never
 * the control flow. Whoever arrives with a symptom and no context reads this.
 *
 * **Where the extension is running is reported first, and deliberately.** From
 * the remote extension host it would read the *container's* CPU count as the
 * host's and go on to compute a limit for the wrong machine, with nothing
 * erroring anywhere. A wrong answer that looks right is the worst shape a bug
 * takes here, so the one fact that distinguishes them is said out loud.
 *
 * **An unreadable template version is not an old one.** Saying "too old" for a
 * file that could not be read sends the reader to bump a submodule that is
 * missing entirely.
 */
export function formatDetected(detected: Detected): string[] {
  const { templateVersion, templateMinVersion, facts, runningOnHost } = detected
  const lines: string[] = []

  lines.push(
    runningOnHost
      ? 'running on the host, which is where this extension has to run'
      : 'NOT running on the host. Every number below describes the container rather than the ' +
          'machine, so any limit computed from them would be wrong without failing. Check that ' +
          'the extension is installed with extensionKind "ui".',
  )

  lines.push(
    templateVersion === null
      ? `template version: could not be read. .code-server/version.txt is not there — the ` +
          `submodule is probably not initialised (git submodule update --init). This is not the ` +
          `same as an out-of-date template; minimum required is ${templateMinVersion}`
      : `template version: ${templateVersion} (minimum required: ${templateMinVersion})`,
  )

  lines.push(`host CPUs: ${facts.cpuCount}`)
  lines.push(
    facts.devicesPresent.length > 0
      ? `devices present: ${facts.devicesPresent.join(', ')}`
      : 'devices present: none',
  )
  lines.push(
    facts.devicesAbsent.length > 0
      ? `devices absent, so they will not be passed through: ${facts.devicesAbsent.join(', ')}`
      : 'devices absent: none',
  )

  return lines
}
