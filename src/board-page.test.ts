import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CSP, boardPage, messagePage } from './board-page.ts'
import type { Item } from './board-read.ts'

const NONCE = 'n0nceN0nceN0nce0'

const item = (o: Partial<Item>): Item => ({
  id: 'p-1', title: 'title', status: 'open', type: 'task', labels: [], blockedBy: [], ...o,
})

test('the policy allows nothing but the page itself', () => {
  // FR-118 and the story's safety scenario: content somebody wrote is rendered
  // here, so nothing may run without the page's nonce, and nothing may load.
  assert.equal(
    CSP(NONCE),
    `default-src 'none'; script-src 'nonce-${NONCE}'; style-src 'nonce-${NONCE}'; img-src 'none'; ` +
      `font-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`,
  )
})

test('the page carries the policy, and the nonce only on its own script and style', () => {
  const html = boardPage({ nonce: NONCE, items: [item({})], rendered: new Map() })
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${CSP(NONCE)}">`))
  assert.equal(html.split(`nonce="${NONCE}"`).length - 1, 2, 'one script and one style tag, nothing else')
})

test('what an item says cannot gain the nonce or a place outside its container', () => {
  const hostile = '<script>alert(1)</script><img src="https://example.invalid/x.png" onerror="alert(2)">'
  const rendered = new Map([['p-1', { description: hostile }]])
  const html = boardPage({
    nonce: NONCE,
    items: [item({ title: '<script>t()</script>', description: hostile })],
    rendered,
  })
  // The title is text, escaped.
  assert.ok(!html.includes('<script>t()</script>'))
  assert.ok(html.includes('&lt;script&gt;t()&lt;/script&gt;'))
  // The rendered body is HTML by design, so it is the policy that disarms it:
  // every script in the page that carries the nonce is the page's own.
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
  assert.equal(scripts.filter((s) => s.includes(NONCE)).length, 1)
  assert.ok(scripts.filter((s) => !s.includes(NONCE)).every((s) => s === '<script>'))
})

test('an item without a rendering shows its text as text', () => {
  // markdown.api.render can be unavailable; the text must still be readable and
  // still be inert.
  const html = boardPage({ nonce: NONCE, items: [item({ description: '<b>raw</b>' })], rendered: new Map() })
  assert.ok(html.includes('&lt;b&gt;raw&lt;/b&gt;'))
})

test('both views and every item are on the page', () => {
  const items = [
    item({ id: 'a', title: 'Alpha', status: 'deferred', labels: ['proposed'] }),
    item({ id: 'b', title: 'Beta', status: 'closed', closeReason: 'done' }),
    item({ id: 'c', title: 'Gamma', type: 'bug', labels: ['defect'], debtKind: 'defect' }),
  ]
  const html = boardPage({ nonce: NONCE, items, rendered: new Map() })
  assert.ok(html.includes('data-tab="board"') && html.includes('data-tab="tree"'))
  for (const title of ['Alpha', 'Beta', 'Gamma']) assert.ok(html.includes(title), title)
  assert.ok(html.includes('Proposals'))
  assert.ok(html.includes('defect'))
})

test('nothing on the page offers to change the tracker', () => {
  // The only messages the page sends are to read again and to open an item.
  const html = boardPage({ nonce: NONCE, items: [item({})], rendered: new Map() })
  const sent = [...html.matchAll(/postMessage\(\{\s*type:\s*'([a-z]+)'/g)].map((m) => m[1])
  assert.deepEqual([...new Set(sent)].sort(), ['refresh'])
  assert.ok(!/<(form|input|textarea)\b/.test(html))
})

test('a page that only says something carries the same policy', () => {
  const html = messagePage({ nonce: NONCE, title: 'Not running', body: 'The container <is> stopped.' })
  assert.ok(html.includes(CSP(NONCE)))
  assert.ok(html.includes('The container &lt;is&gt; stopped.'))
})

test('a notice is said above the board, as text', () => {
  // When markdown.api.render is unavailable the items are plain text, and the
  // page says why rather than leaving the operator to wonder.
  const html = boardPage({ nonce: NONCE, items: [item({})], rendered: new Map(), notice: 'Markdown <off>' })
  assert.ok(html.includes('Markdown &lt;off&gt;'))
})
