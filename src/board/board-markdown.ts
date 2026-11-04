/**
 * Raw HTML in an item's Markdown, made text before the board renders it (gh-335,
 * debt the-work-board-renders-bead-text-as-html).
 *
 * The board renders an item's long fields with VS Code's `markdown.api.render`,
 * which passes raw HTML through. Bead text is written by whoever writes to the
 * tracker, agents included, and Gherkin scenarios are full of `<placeholder>`s:
 * a `<title>` became a real <title>, an RCDATA element that swallowed the rest of
 * the page, so no control existed and the board froze. `<textarea>`, `<style>`
 * and `<iframe>` do the same; `<host>` silently drops the word. The page's CSP
 * keeps any of it from running script; this keeps it from being markup.
 *
 * **Only `<`, and only where Markdown would read a tag.** Escaped as `&lt;`, the
 * renderer shows it as text and the rest of the Markdown — the formatting the
 * board was built for — renders as before. `>` is left alone because it starts a
 * blockquote, and `&` because the text may mean an entity. Left as they are,
 * because the renderer already shows them literally and escaping them would show
 * `&lt;` instead:
 *
 * - fenced code blocks (``` or ~~~) and indented code blocks;
 * - code spans, matched as CommonMark matches them: a run of n backticks closed
 *   by the next run of exactly n, within the paragraph;
 * - autolinks, `<https://…>` and `<a@b.c>`, which stay links;
 * - a backslash escape, `\<`, which is already text.
 *
 * Pure, and with no dependency: the board carries no Markdown parser of its own,
 * and this does not add one. What it approximates of CommonMark errs towards
 * escaping, which costs a visible `&lt;` at worst, never a frozen board.
 */
export function escapeRawHtml(markdown: string): string {
  const out: string[] = []
  let paragraph: string[] = []
  let fence: { char: string; length: number } | null = null
  let previousBlank = true
  let inIndented = false

  const flush = (): void => {
    if (paragraph.length > 0) out.push(escapeInline(paragraph.join('\n')))
    paragraph = []
  }

  for (const line of markdown.split('\n')) {
    if (fence !== null) {
      out.push(line)
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)
      if (close !== null && close[1]![0] === fence.char && close[1]!.length >= fence.length) fence = null
      continue
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    // A backtick fence's info string cannot hold a backtick; if it does, the
    // line is a code span, not a fence.
    if (open !== null && !(open[1]![0] === '`' && open[2]!.includes('`'))) {
      flush()
      fence = { char: open[1]![0]!, length: open[1]!.length }
      out.push(line)
      previousBlank = false
      inIndented = false
      continue
    }
    const blank = line.trim() === ''
    if (blank) {
      flush()
      out.push(line)
      previousBlank = true
      continue
    }
    // An indented code block cannot interrupt a paragraph: it starts after a
    // blank line (or at the top) and runs on through blank lines.
    if (/^( {4}|\t)/.test(line) && paragraph.length === 0 && (previousBlank || inIndented)) {
      out.push(line)
      inIndented = true
      previousBlank = false
      continue
    }
    inIndented = false
    previousBlank = false
    paragraph.push(line)
  }
  flush()
  return out.join('\n')
}

const AUTOLINK = /^<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*>/
const EMAIL_AUTOLINK = /^<[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*>/
const PUNCTUATION = /[!-/:-@[-`{-~]/

function escapeInline(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === '\\' && i + 1 < text.length && PUNCTUATION.test(text[i + 1]!)) {
      out += text.slice(i, i + 2)
      i += 2
      continue
    }
    if (c === '`') {
      let n = 0
      while (text[i + n] === '`') n++
      const close = closingRun(text, i + n, n)
      if (close === -1) {
        out += text.slice(i, i + n)
        i += n
      } else {
        out += text.slice(i, close + n)
        i = close + n
      }
      continue
    }
    if (c === '<') {
      const rest = text.slice(i)
      const link = AUTOLINK.exec(rest) ?? EMAIL_AUTOLINK.exec(rest)
      if (link !== null) {
        out += link[0]
        i += link[0].length
        continue
      }
      out += '&lt;'
      i++
      continue
    }
    out += c
    i++
  }
  return out
}

/** Where the next run of exactly `n` backticks starts at or after `from`, or -1. */
function closingRun(text: string, from: number, n: number): number {
  let i = from
  while (i < text.length) {
    if (text[i] !== '`') {
      i++
      continue
    }
    let run = 0
    while (text[i + run] === '`') run++
    if (run === n) return i
    i += run
  }
  return -1
}
