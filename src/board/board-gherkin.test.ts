import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseGherkin } from './board-gherkin.ts'

test('a Feature and its Scenarios become structure, in order, indented or not', () => {
  const g = parseGherkin(`Feature: filters combine

Scenario: A value can be excluded
  When the developer filters
  Then no bug is shown
  And every other type is

Scenario: Another
Given x
But y`)
  assert.equal(g?.feature, 'filters combine')
  assert.deepEqual(g?.scenarios.map((s) => s.name), ['A value can be excluded', 'Another'])
  assert.deepEqual(g?.scenarios[0]?.steps, [
    { keyword: 'When', text: 'the developer filters' },
    { keyword: 'Then', text: 'no bug is shown' },
    { keyword: 'And', text: 'every other type is' },
  ])
  assert.deepEqual(g?.scenarios[1]?.steps.map((s) => s.keyword), ['Given', 'But'])
})

test('a Feature is not needed, a Scenario is', () => {
  assert.equal(parseGherkin('Scenario: Only\n  Given x')?.feature, undefined)
  assert.equal(parseGherkin('Feature: nothing under it'), undefined)
  assert.equal(parseGherkin(''), undefined)
  assert.equal(parseGherkin('done when the tests pass'), undefined)
})

test('text it does not understand refuses the whole, so nothing is dropped', () => {
  assert.equal(parseGherkin('Scenario: A\n  Given x\nA note someone added'), undefined)
  assert.equal(parseGherkin('Some intro\n\nScenario: A\n  Given x'), undefined)
  assert.equal(parseGherkin('Given a step with no scenario'), undefined)
  assert.equal(parseGherkin('Scenario: A\n  Given x\n  | a table |'), undefined)
})
