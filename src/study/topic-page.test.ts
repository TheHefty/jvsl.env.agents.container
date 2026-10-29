import { test } from 'node:test'
import assert from 'node:assert/strict'

import { problemsPage, topicPage } from './topic-page.ts'

// --- the topic page: the guide, its state, and the moves (story the-study-view)
//
// Since 2026-10-28 a topic is its guide alone (task the-practice-leaves-the-study).

const page = (state?: string) => topicPage({ nonce: 'n0nce', title: 'Labels', guide: { html: '<h2>The problem</h2><p>Labels are null.</p>' }, ...(state === undefined ? {} : { state }) })

test('the page is the rendered guide', () => {
  assert.ok(page().includes('<h2>The problem</h2><p>Labels are null.</p>'))
})

test('no practice is offered: no attempt to save, no answer to reveal', () => {
  const html = page('studying')
  assert.ok(!/attempt/i.test(html), 'nothing says attempt')
  assert.ok(!/<textarea/.test(html))
  assert.ok(!/Answer/.test(html))
})

test("the page says the topic's state, and offers ready to write and publishing", () => {
  const html = page('studying')
  assert.ok(html.includes('State: studying'))
  assert.ok(html.includes('id="ready"'))
  assert.ok(html.includes('id="publish"') && html.includes('id="link"'))
})

test('a published topic offers no move', () => {
  const html = page('published')
  assert.ok(html.includes('State: published'))
  assert.ok(!html.includes('id="ready"') && !html.includes('id="publish"'))
})

test('a guide whose rendering is unavailable is shown as text, and the page says why', () => {
  const html = topicPage({ nonce: 'n0nce', title: 'Labels', guide: { text: '# <b>raw</b>', notice: 'the Markdown renderer is off' } })
  assert.ok(html.includes('&lt;b&gt;raw&lt;/b&gt;'))
  assert.ok(html.includes('the Markdown renderer is off'))
})

test('the page carries the policy, and a rendered guide cannot carry the nonce onto a script of its own', () => {
  const html = topicPage({ nonce: 'n0nce', title: '<script>t()</script>', guide: { html: '<script>alert(1)</script><p>x</p>' } })
  assert.match(html, /Content-Security-Policy" content="default-src 'none'; script-src 'nonce-n0nce'/)
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
  assert.equal(scripts.filter((s) => s.includes('n0nce')).length, 1)
  assert.ok(html.includes('&lt;script&gt;t()&lt;/script&gt;'))
})

test('a broken topic opens on its problems, with no guide', () => {
  const html = problemsPage({ nonce: 'n0nce', title: 'Labels', problems: ['guide.md: has no "## Sources" section'] })
  assert.ok(html.includes('has no &quot;## Sources&quot; section'))
})
