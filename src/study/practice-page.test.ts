import { test } from 'node:test'
import assert from 'node:assert/strict'

import { practicePage, problemsPage, type Practice } from './practice-page.ts'

// --- an answer is never in the page before an attempt (story the-study-view) ---
//
// Hiding it with CSS would still put it in the HTML, one devtools click away,
// and the practice exists so that the developer tries before they see.

const practice: Practice = {
  topic: 'labels',
  items: [
    { id: 'q-1', kind: 'question', level: 1, prompt: 'What does index do on null?', answer: 'It FAILS: index needs a string or an array & more', variation: false },
    { id: 'q-2', kind: 'question', level: 2, prompt: 'What if <script>alert(1)</script>?', answer: 'The default still holds', variation: true },
  ],
}
const page = (attempts: Record<string, { at: string; text: string }[]>) =>
  practicePage({ nonce: 'n0nce', title: 'Labels', guide: { html: '<h2>The problem</h2><p>Labels are null.</p>' }, practice, attempts })

const forms = (answer: string) => [answer, answer.replace(/&/g, '&amp;'), answer.replace(/&/g, '&#38;'), answer.toLowerCase()]

test('an item with no attempt carries no answer, in any escaping', () => {
  const html = page({})
  for (const item of practice.items) for (const form of forms(item.answer)) assert.ok(!html.includes(form), `${item.id}: ${form}`)
  assert.ok(html.includes('What does index do on null?'))
})

test('an attempted item shows its answer beside its attempts, with their dates', () => {
  const html = page({ 'q-1': [{ at: '2026-10-28T21:00:00-03:00', text: 'it fails' }] })
  assert.ok(html.includes('It FAILS: index needs a string or an array &amp; more'))
  assert.ok(html.includes('it fails'))
  assert.ok(html.includes('2026-10-28T21:00:00-03:00'))
  assert.ok(!html.includes('The default still holds'), 'the unattempted item stays hidden')
})

test('the page carries the policy, its nonce only on its own script and style, and escapes what the files hold', () => {
  const html = page({})
  assert.match(html, /Content-Security-Policy" content="default-src 'none'; script-src 'nonce-n0nce'/)
  assert.equal((html.match(/nonce="n0nce"/g) ?? []).length, 2)
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
})

test('an attempt written in the page cannot carry the nonce', () => {
  const html = page({ 'q-2': [{ at: '2026-10-28T21:00:00-03:00', text: '<script nonce="n0nce">x</script>' }] })
  assert.equal((html.match(/nonce="n0nce"/g) ?? []).length, 2)
})

test('the guide comes first, rendered, and the practice follows it', () => {
  const html = page({})
  const guide = html.indexOf('<h2>The problem</h2>')
  const first = html.indexOf('What does index do on null?')
  assert.ok(guide > 0 && first > guide, `guide at ${guide}, first item at ${first}`)
})

test('a guide whose rendering is unavailable is shown as text, and the page says why', () => {
  const html = practicePage({ nonce: 'n0nce', title: 'Labels', guide: { text: '# <b>raw</b>', notice: 'the Markdown renderer is off' }, practice, attempts: {} })
  assert.ok(html.includes('&lt;b&gt;raw&lt;/b&gt;'))
  assert.ok(html.includes('the Markdown renderer is off'))
})

test('a rendered guide is HTML by design, and still cannot carry the nonce onto a script of its own', () => {
  const hostile = '<script>alert(1)</script><p>x</p>'
  const html = practicePage({ nonce: 'n0nce', title: 'Labels', guide: { html: hostile }, practice, attempts: {} })
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
  assert.equal(scripts.filter((s) => s.includes('n0nce')).length, 1)
})

test('a broken topic opens on its problems, with no guide and no practice', () => {
  const html = problemsPage({ nonce: 'n0nce', title: 'Labels', problems: ['guide.md: contains the answer to "q-1"'] })
  assert.ok(html.includes('contains the answer to &quot;q-1&quot;'))
  for (const item of practice.items) assert.ok(!html.includes(item.prompt))
})
