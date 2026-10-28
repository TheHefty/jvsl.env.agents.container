/**
 * The study material's contract, as the Study view reads it (story
 * the-study-material-has-a-contract).
 *
 * **Not a copy: the same file the study skill runs in the container.** esbuild
 * bundles `validate.mjs` from `core/plugin/agent-container/study/`, so the view
 * and the skill cannot disagree about what valid material is — which is the
 * whole reason the validator interprets the schema files rather than restating
 * them.
 */
export { checkTopic, checkTopicWith, loadSchemas, validate, withAttemptsIgnored, GUIDE_SECTIONS } from '../../core/plugin/agent-container/study/validate.mjs'
export type { SchemaError, Schemas, TopicProblem } from '../../core/plugin/agent-container/study/validate.mjs'
