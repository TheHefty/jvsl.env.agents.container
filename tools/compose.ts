/**
 * The composer from a shell, with the interface the deleted core/compose-dockerfile.sh had: the
 * stacks as arguments, STACK_MANIFEST and the CORE_* / STACKS_DIR overrides
 * from the environment, the Dockerfile on stdout, and a refusal on stderr with
 * exit status 1. CI's image jobs and the shell tests call this; the extension
 * calls src/build/compose.ts directly. One composer, two ways in.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compose } from '../src/build/compose.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = process.env
const result = compose({
  root,
  stacks: process.argv.slice(2),
  manifestPath: env['STACK_MANIFEST'],
  stacksDir: env['STACKS_DIR'],
  coreFrag: env['CORE_FRAG'],
  coreVersions: env['CORE_VERSIONS'],
  coreDevcontainer: env['CORE_DEVCONTAINER'],
})
if (result.ok) {
  process.stdout.write(result.dockerfile)
} else {
  process.stderr.write(`${result.message}\n`)
  process.exitCode = 1
}
