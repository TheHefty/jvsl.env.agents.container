import { test } from 'node:test'
import assert from 'node:assert/strict'

import { escapeRawHtml } from './board-markdown.ts'

// gh-335, debt the-work-board-renders-bead-text-as-html: markdown.api.render
// passes raw HTML through, so a Gherkin `<title>` became a real <title> and
// swallowed the board. The source is escaped before it is rendered, and only
// where Markdown would otherwise read a tag.

test('a tag in prose is escaped, so it renders as text', () => {
  assert.equal(escapeRawHtml('Given a page with <title> "B"'), 'Given a page with &lt;title> "B"')
  for (const tag of ['<textarea>', '<style>', '<xmp>', '<iframe src=x>', '<img src=x onerror=alert(1)>', '</title>', '<!-- c -->']) {
    assert.ok(!escapeRawHtml(`x ${tag} y`).includes(tag), tag)
  }
})

test('failure 2: a tag at a line start, or after a backtick that closes nothing, is still escaped', () => {
  assert.equal(escapeRawHtml('<title>\nnext'), '&lt;title>\nnext')
  assert.equal(escapeRawHtml('one ` tick <title>'), 'one ` tick &lt;title>')
  assert.equal(escapeRawHtml('  <div>indented less than four</div>'), '  &lt;div>indented less than four&lt;/div>')
})

test('failure 1: code is left alone, so the renderer shows it literally and nothing is escaped twice', () => {
  assert.equal(escapeRawHtml('run `<title>` here'), 'run `<title>` here')
  assert.equal(escapeRawHtml('``a ` <b> ``'), '``a ` <b> ``')
  const fenced = '```gherkin\nGiven a page with <title> "B"\n```'
  assert.equal(escapeRawHtml(fenced), fenced)
  const tilde = '~~~\n<textarea>\n~~~'
  assert.equal(escapeRawHtml(tilde), tilde)
  const indented = 'para\n\n    <title> in an indented block'
  assert.equal(escapeRawHtml(indented), indented)
  // And prose after a fence is escaped again.
  assert.equal(escapeRawHtml('```\n<a>\n```\n<b>'), '```\n<a>\n```\n&lt;b>')
})

test('an unclosed fence runs to the end, as Markdown reads it', () => {
  assert.equal(escapeRawHtml('```\n<title>'), '```\n<title>')
})

test('failure 3: an autolink stays a link', () => {
  assert.equal(escapeRawHtml('see <https://example.com/a?b=1> now'), 'see <https://example.com/a?b=1> now')
  assert.equal(escapeRawHtml('mail <mailto:a@b.c>'), 'mail <mailto:a@b.c>')
})

test('blockquotes, comparisons and entities are not touched', () => {
  assert.equal(escapeRawHtml('> quoted\na > b && c'), '> quoted\na > b && c')
  assert.equal(escapeRawHtml('1 < 2'), '1 &lt; 2')
})
