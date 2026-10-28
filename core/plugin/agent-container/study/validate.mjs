// The study material's contract, checked (story the-study-material-has-a-contract).
//
// One file, read by both sides: the study skill runs it in the container
// (bin/study-validate) and the extension bundles it for the Study view, so the
// two cannot disagree about what valid material is.
//
// **It interprets the schema files themselves**, so the schema is the single
// source of the rules (chosen over ajv, a dependency on both sides). It knows
// only the subset the contract uses, and **a keyword it does not know is an
// error, never skipped**: a rule added to a schema and silently ignored is a
// rule nobody enforces.
//
// checkTopic adds what a schema cannot say: the topic is its folder's name, item
// ids are unique, every attempt is for an item that exists, and the guide has
// its seven sections in order.

import { readFileSync, existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description'])
const KEYWORDS = new Set(['type', 'required', 'properties', 'additionalProperties', 'items', 'enum', 'const',
  'pattern', 'minLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'contains', 'minContains', 'maxContains', 'allOf'])

export const GUIDE_SECTIONS = ['The problem', 'Fundamentals', 'What goes wrong without it', 'How the project solves it',
  'Trade-offs', 'Sources', 'Points for the post']

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v)
const isType = (v, t) => t === typeOf(v) || (t === 'number' && typeof v === 'number')
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
// What a `contains` schema asks for, in words: the constants it pins.
const described = (s) => Object.entries(s.properties ?? {}).filter(([, p]) => 'const' in p)
  .map(([k, p]) => `${k} ${JSON.stringify(p.const)}`).join(' and ') || 'the condition'

/** Every way `data` breaks `schema`, as {path, rule, message}; none when it is valid. */
export function validate(schema, data, path = '') {
  const errors = []
  const fail = (rule, message, at = path) => errors.push({ path: at, rule, message })
  for (const key of Object.keys(schema)) {
    if (!KEYWORDS.has(key) && !ANNOTATIONS.has(key)) fail('schema', `unsupported schema keyword "${key}"`)
  }
  if (errors.length) return errors
  if (schema.type && !isType(data, schema.type)) return [{ path, rule: 'type', message: `must be ${schema.type}, is ${typeOf(data)}` }]
  if ('const' in schema && !equal(data, schema.const)) fail('const', `must be ${JSON.stringify(schema.const)}`)
  if (schema.enum && !schema.enum.some((e) => equal(e, data))) fail('enum', `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}, is ${JSON.stringify(data)}`)
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) fail('minLength', schema.minLength === 1 ? 'must not be empty' : `must be at least ${schema.minLength} characters`)
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(data)) fail('pattern', `${JSON.stringify(data)} does not match ${schema.pattern}`)
  }
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) fail('minimum', `must be at least ${schema.minimum}, is ${data}`)
    if (schema.maximum !== undefined && data > schema.maximum) fail('maximum', `must be at most ${schema.maximum}, is ${data}`)
  }
  if (typeOf(data) === 'object') {
    for (const key of schema.required ?? []) if (!(key in data)) fail('required', `missing "${key}"`)
    for (const [key, value] of Object.entries(data)) {
      const at = `${path}/${key}`
      if (schema.properties && key in schema.properties) errors.push(...validate(schema.properties[key], value, at))
      else if (schema.additionalProperties === false) fail('additionalProperties', `"${key}" is not part of the contract`)
      else if (typeof schema.additionalProperties === 'object') errors.push(...validate(schema.additionalProperties, value, at))
    }
  }
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) fail('minItems', `needs at least ${schema.minItems} items, has ${data.length}`)
    if (schema.maxItems !== undefined && data.length > schema.maxItems) fail('maxItems', `takes at most ${schema.maxItems} items, has ${data.length}`)
    if (schema.items) data.forEach((v, i) => errors.push(...validate(schema.items, v, `${path}/${i}`)))
    if (schema.contains) {
      const n = data.filter((v) => validate(schema.contains, v, '').length === 0).length
      const min = schema.minContains ?? 1
      if (n < min) fail('minContains', `needs at least ${min} items with ${described(schema.contains)}, found ${n}`)
      if (schema.maxContains !== undefined && n > schema.maxContains) fail('maxContains', `takes at most ${schema.maxContains} items with ${described(schema.contains)}, found ${n}`)
    }
  }
  for (const sub of schema.allOf ?? []) errors.push(...validate(sub, data, path))
  return errors
}

const SCHEMAS = {
  practice: JSON.parse(readFileSync(join(HERE, 'practice.schema.json'), 'utf8')),
  attempts: JSON.parse(readFileSync(join(HERE, 'attempts.schema.json'), 'utf8')),
}

function readJson(file, problems) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (error) {
    problems.push({ file: basename(file), path: '', rule: 'json', message: `is not valid JSON (${error.message})` })
    return { ok: false }
  }
}

/** Every problem with the topic in `dir`, each with its file; none when it is valid. */
export function checkTopic(dir) {
  const problems = []
  const add = (file, list) => problems.push(...list.map((e) => ({ file, ...e })))
  const practiceFile = join(dir, 'practice.json')
  if (!existsSync(practiceFile)) {
    problems.push({ file: 'practice.json', path: '', rule: 'missing', message: `is missing from ${dir}` })
  } else {
    const practice = readJson(practiceFile, problems)
    if (practice.ok) {
      add('practice.json', validate(SCHEMAS.practice, practice.value))
      const p = practice.value
      if (typeof p?.topic === 'string' && p.topic !== basename(dir)) {
        add('practice.json', [{ path: '/topic', rule: 'folder', message: `is "${p.topic}", but the topic's folder is "${basename(dir)}"` }])
      }
      const items = Array.isArray(p?.items) ? p.items : []
      const seen = new Map()
      items.forEach((item, i) => {
        if (typeof item?.id !== 'string') return
        if (seen.has(item.id)) add('practice.json', [{ path: `/items/${i}/id`, rule: 'unique', message: `"${item.id}" is used twice, here and at /items/${seen.get(item.id)}` }])
        else seen.set(item.id, i)
      })
      const attemptsFile = join(dir, 'attempts.json')
      if (existsSync(attemptsFile)) {
        const attempts = readJson(attemptsFile, problems)
        if (attempts.ok) {
          add('attempts.json', validate(SCHEMAS.attempts, attempts.value))
          for (const key of Object.keys(typeOf(attempts.value) === 'object' ? attempts.value : {})) {
            if (!seen.has(key)) add('attempts.json', [{ path: `/${key}`, rule: 'item', message: `is an attempt for "${key}", which practice.json does not have` }])
          }
        }
      }
    }
  }
  const guideFile = join(dir, 'guide.md')
  if (!existsSync(guideFile)) {
    problems.push({ file: 'guide.md', path: '', rule: 'missing', message: `is missing from ${dir}` })
  } else {
    const headings = readFileSync(guideFile, 'utf8').split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim())
    for (const want of GUIDE_SECTIONS) {
      if (!headings.includes(want)) problems.push({ file: 'guide.md', path: '', rule: 'section', message: `has no "## ${want}" section` })
    }
    const order = headings.filter((h) => GUIDE_SECTIONS.includes(h))
    if (GUIDE_SECTIONS.every((s) => order.includes(s)) && order.join('|') !== GUIDE_SECTIONS.join('|')) {
      problems.push({ file: 'guide.md', path: '', rule: 'order', message: `has its sections out of order; they are ${GUIDE_SECTIONS.join(', ')}` })
    }
  }
  return problems
}
