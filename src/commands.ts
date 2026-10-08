import { run } from './host/docker.ts'

/** The command ids, in one place so a command module never imports the entry point. */
export const SHOW_DETECTED = 'jvsl.agentContainer.showDetected'
/** Never contributed, so never in the palette: registered so the open flow can be run again by id. */
export const OPEN = 'jvsl.agentContainer.prepare'
export const CONFIGURE = 'jvsl.agentContainer.configure'
export const BUILD = 'jvsl.agentContainer.build'
export const SHOW_WORK = 'jvsl.agentContainer.showWork'
export const MIGRATE = 'jvsl.agentContainer.migrate'
export const PICK = 'jvsl.agentContainer.open'
export const CREATE = 'jvsl.agentContainer.create'
export const VIEW = 'jvsl.agentContainer.view'
