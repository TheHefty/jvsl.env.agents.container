import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The image's Dockerfile, composed from core and the selected stacks.
 *
 * **Ported from core/compose-dockerfile.sh on 2026-10-22** (task
 * the-composer-is-typescript), because that script needs bash and jq and a
 * Windows editor has neither: a project on Windows could not be built at all.
 * The port was held byte-for-byte to the script's output over every stack,
 * every version each offers and the manifests its test drives, and the
 * script's own test now drives this through tools/compose.ts. **There is one
 * composer**: the script was deleted with the port, because two composers of
 * one Dockerfile drift, and an image built from the editor would stop being
 * the one CI built — the defect this function exists to prevent (see
 * build.ts, where CI's copy once ignored requires.json and built android with
 * no JDK).
 *
 * What it does, in the order the output shows it:
 *
 * - **core's fragment**, with each `{{NAME_VERSION}}` filled from
 *   core/versions.json (`claude-code` fills `{{CLAUDE_CODE_VERSION}}`). A
 *   placeholder nothing fills is a refusal, naming it: a literal
 *   `{{CODEX_VERSION}}` in a RUN line fails forty seconds into a build with a
 *   message about the package manager instead.
 * - **each stack's fragment**, dependencies first (requires.json, transitively,
 *   each once), with `{{VERSION}}` filled from the manifest or the stack's first
 *   offered version.
 * - **the project's Debian packages**, from the manifest's `packages`, each held
 *   to a package name's shape because the install runs as root.
 * - **the devcontainer.metadata label, last**: core's and each stack's entries
 *   concatenated, `{{VERSION}}` filled in string values only — the version comes
 *   from the manifest, and a quote in it must not change the JSON around it — and
 *   the same JSON written to /opt/jvsl for the boot hook that cannot read its own
 *   image's labels. Last because a later LABEL with the same key replaces it.
 */
export interface ComposeInput {
  /** The folder holding core/ and stacks/: the extension, or a checkout. */
  root: string
  /** The stacks asked for, in the manifest's order. */
  stacks: readonly string[]
  /** The project's manifest, read for versions and packages when it exists. */
  manifestPath?: string
  /** Overrides, so the test beside the script can point at fixtures. */
  stacksDir?: string
  coreFrag?: string
  coreVersions?: string
  coreDevcontainer?: string
}

export type Composed = { ok: true; dockerfile: string } | { ok: false; message: string }

class Refusal extends Error {}

const PACKAGE = /^[a-z0-9][a-z0-9+.-]+$/

export function compose(input: ComposeInput): Composed {
  try {
    return { ok: true, dockerfile: composeOrThrow(input) }
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, message: error.message }
    throw error
  }
}

function composeOrThrow(input: ComposeInput): string {
  const stacksDir = input.stacksDir ?? join(input.root, 'stacks')
  const coreFrag = input.coreFrag ?? join(input.root, 'core', 'Dockerfile.frag')
  const coreVersions = input.coreVersions ?? join(input.root, 'core', 'versions.json')
  const coreDevcontainer = input.coreDevcontainer ?? join(input.root, 'core', 'devcontainer.json')

  for (const name of input.stacks) {
    if (!isDirectory(join(stacksDir, name))) refuse(`compose-dockerfile: unknown stack '${name}'.`)
  }

  const ordered: string[] = []
  const added = new Set<string>()
  const add = (name: string): void => {
    if (added.has(name)) return
    added.add(name)
    const requires = join(stacksDir, name, 'requires.json')
    if (existsSync(requires)) {
      for (const dep of jsonArray(requires)) {
        const depName = jqRaw(dep)
        if (!isDirectory(join(stacksDir, depName))) {
          refuse(`compose-dockerfile: stack '${name}' requires unknown stack '${depName}'.`)
        }
        add(depName)
      }
    }
    ordered.push(name)
  }
  for (const name of input.stacks) add(name)

  // `$(cat file)`: trailing newlines removed, then printed with exactly one.
  let core = readFileSync(coreFrag, 'utf8').replace(/\n+$/, '')
  const versions = JSON.parse(readFileSync(coreVersions, 'utf8')) as Record<string, unknown>
  for (const [key, version] of Object.entries(versions)) {
    const placeholder = `{{${key.replace(/[a-z]/g, (c) => c.toUpperCase()).replace(/-/g, '_')}_VERSION}}`
    core = core.split(placeholder).join(jqRaw(version))
  }
  const unfilled = [...new Set(core.match(/\{\{[A-Z_]*\}\}/g) ?? [])].sort().join(' ')
  if (unfilled !== '') refuse(`compose-dockerfile: nothing in ${coreVersions} fills ${unfilled} in ${coreFrag}.`)

  const manifest = readManifest(input.manifestPath)
  const packages: string[] = []
  if (manifest !== undefined && typeof manifest.value === 'object' && manifest.value !== null &&
      !Array.isArray(manifest.value) && 'packages' in manifest.value) {
    const list = (manifest.value as Record<string, unknown>)['packages']
    if (!Array.isArray(list) || !list.every((p) => typeof p === 'string')) {
      refuse(`compose-dockerfile: "packages" in ${manifest.path} must be a list of Debian package names, like ["libsdl2-dev"]. Nothing was composed.`)
    }
    for (const pkg of list) {
      if (!PACKAGE.test(pkg)) {
        refuse(`compose-dockerfile: ${shellQuote(pkg)} in "packages" is not a Debian package name: lower case letters, digits, + . and -, at least two characters, starting with a letter or digit. Nothing was composed.`)
      }
      packages.push(pkg)
    }
  }

  let out = `${core}\n`
  const stackVersion = new Map<string, string>()
  for (const name of ordered) {
    let version = ''
    if (manifest !== undefined && typeof manifest.value === 'object' && manifest.value !== null && !Array.isArray(manifest.value)) {
      const asked = (manifest.value as Record<string, unknown>)[name]
      // jq's `.[$s] // empty`: null and false are absent.
      if (asked !== undefined && asked !== null && asked !== false) version = jqRaw(asked)
    }
    if (version === '') version = jqRaw(jsonArray(join(stacksDir, name, 'versions.json'))[0])
    stackVersion.set(name, version)
    out += `\n${readFileSync(join(stacksDir, name, 'Dockerfile.frag'), 'utf8').split('{{VERSION}}').join(version)}`
  }

  const metadataFiles = [coreDevcontainer, ...ordered.map((n) => join(stacksDir, n, 'devcontainer.json')).filter(existsSync)]
  for (const f of metadataFiles) {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(f, 'utf8'))
    } catch {
      parsed = undefined
    }
    if (!Array.isArray(parsed)) {
      refuse(`compose-dockerfile: ${f} is not a JSON array of devcontainer metadata entries. The composed devcontainer.metadata label would be unreadable, and a client that cannot parse it falls back to the image's USER, which is root.`)
    }
  }
  const entries: unknown[] = [...(JSON.parse(readFileSync(coreDevcontainer, 'utf8')) as unknown[])]
  for (const name of ordered) {
    const f = join(stacksDir, name, 'devcontainer.json')
    if (!existsSync(f)) continue
    const version = stackVersion.get(name) ?? ''
    entries.push(...(fillStrings(JSON.parse(readFileSync(f, 'utf8')), version) as unknown[]))
  }
  const metadata = JSON.stringify(entries)
  if (metadata.includes("'")) {
    refuse(`compose-dockerfile: the composed devcontainer.metadata contains a single quote, which would end the LABEL's quoting early: ${metadata}`)
  }

  if (packages.length > 0) {
    out += `\nRUN apt-get update && apt-get install -y --no-install-recommends ${packages.join(' ')} && rm -rf /var/lib/apt/lists/*\n`
  }
  out += `\nRUN mkdir -p /opt/jvsl && printf '%s\\n' '${metadata}' > /opt/jvsl/devcontainer-metadata.json\n`
  out += `LABEL devcontainer.metadata='${metadata}'\n`
  return out
}

function refuse(message: string): never {
  throw new Refusal(message)
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function jsonArray(path: string): unknown[] {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  return Array.isArray(parsed) ? parsed : []
}

/** What `jq -r` prints for a value: strings bare, everything else as JSON. */
function jqRaw(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function readManifest(path: string | undefined): { path: string; value: unknown } | undefined {
  if (path === undefined || path === '' || !existsSync(path) || !statSync(path).isFile()) return undefined
  return { path, value: JSON.parse(readFileSync(path, 'utf8')) as unknown }
}

/** `{{VERSION}}` filled in every string value, never in a key: jq's walk + gsub. */
function fillStrings(value: unknown, version: string): unknown {
  if (typeof value === 'string') return value.split('{{VERSION}}').join(version)
  if (Array.isArray(value)) return value.map((v) => fillStrings(v, version))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillStrings(v, version)]))
  }
  return value
}

/** bash's printf %q, for the one message that quotes a package name back. */
function shellQuote(s: string): string {
  if (s === '') return "''"
  if (/^[A-Za-z0-9_\-./=:,+@%^]+$/.test(s)) return s
  if ([...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) {
    return `$'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r')}'`
  }
  return s.replace(/([^A-Za-z0-9_\-./=:,+@%^])/g, '\\$1')
}
