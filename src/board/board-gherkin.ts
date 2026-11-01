/**
 * Acceptance criteria as structure, so the item panel can draw each scenario as
 * a card (story dox.4). **It refuses rather than guesses:** one line it does not
 * understand and the whole text stays as rendered Markdown, because a card that
 * silently dropped a line would misstate what was agreed. Pure, and what it
 * returns is still text somebody wrote: the page escapes it.
 */
export interface Step {
  keyword: string
  text: string
}

export interface Scenario {
  name: string
  steps: Step[]
}

export interface Gherkin {
  feature?: string
  scenarios: Scenario[]
}

export function parseGherkin(text: string): Gherkin | undefined {
  const scenarios: Scenario[] = []
  let feature: string | undefined
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    const head = /^(Feature|Scenario):\s*(.*)$/.exec(line)
    const step = /^(Given|When|Then|And|But)\s+(.+)$/.exec(line)
    const current = scenarios.at(-1)
    if (head?.[1] === 'Feature' && feature === undefined && current === undefined) feature = head[2] ?? ''
    else if (head?.[1] === 'Scenario') scenarios.push({ name: head[2] ?? '', steps: [] })
    else if (step !== null && current !== undefined) current.steps.push({ keyword: step[1] ?? '', text: step[2] ?? '' })
    else return undefined
  }
  if (scenarios.length === 0) return undefined
  return feature === undefined ? { scenarios } : { feature, scenarios }
}
