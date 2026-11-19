/**
 * IDEA.md's contract, as the extension reads it (story the-ideas-have-a-contract,
 * gh-364).
 *
 * **Not a copy: the same file the agent runs in the container.** esbuild bundles
 * `contract.mjs` from `core/plugin/agent-container/ideas/`, and `bin/idea-check`
 * runs it with the image's node, so the extension and the agent cannot disagree
 * about what a valid idea is (task the-plugin-checks-an-idea-against-the-same-
 * contract). The study contract is held the same way.
 */
export { parseIdea, readyProblems, IDEA_SECTIONS, IDEA_STATES } from '../../core/plugin/agent-container/ideas/contract.mjs'
export type { Idea, IdeaProblem, IdeaSection, IdeaState } from '../../core/plugin/agent-container/ideas/contract.mjs'
