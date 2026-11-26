/**
 * The verification queue in the developer's ~/.claude (epic
 * what-a-release-changed-is-verified-in-each-project-by-the-agent-there).
 *
 * **Requests are written only by the extension, on the host**, and every
 * container binds them read-only: a request is an instruction another
 * project's agent runs, so a container that could write one could make that
 * agent run it (threat model T5). **Reports are written by the agent in each
 * project**, and stay writable — a forged one is an accepted risk.
 *
 * Relative to the home, as IDEAS_PATH is, with `/` between parts: hostDirs
 * rejoins them in the home's own separator.
 */
export const VERIFICATIONS_PATH = '.claude/agent-container/verifications'
export const REQUESTS_PATH = `${VERIFICATIONS_PATH}/requests`
export const REPORTS_PATH = `${VERIFICATIONS_PATH}/reports`
