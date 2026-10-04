import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decidePick } from './pick.ts'

const base = { chosen: '/work/a-project', currentFolder: undefined, hasManifest: true }

test('nothing chosen is not an error', () => {
  // Cancelling a picker is a person changing their mind. An error dialog for it
  // is the extension telling them off for using it.
  const d = decidePick({ ...base, chosen: undefined })
  assert.equal(d.action, 'nothing')
  assert.equal(d.because, undefined)
})

test('with no folder open, the current window is reused', () => {
  // There is nothing in it to lose.
  const d = decidePick({ ...base, currentFolder: undefined })
  assert.equal(d.action, 'open')
  assert.equal(d.newWindow, false)
})

test('with a folder open, a new window is used', () => {
  // vscode.openFolder defaults to the current window, so reusing it closes
  // whatever somebody had open — including unsaved editors in a project that
  // has nothing to do with this.
  const d = decidePick({ ...base, currentFolder: '/work/something-else' })
  assert.equal(d.action, 'open')
  assert.equal(d.newWindow, true)
})

test('choosing the folder this window already has does nothing', () => {
  const d = decidePick({ ...base, chosen: '/work/a-project', currentFolder: '/work/a-project' })
  assert.equal(d.action, 'nothing')
  assert.match(d.because ?? '', /already open/i)
})

test('a trailing slash is the same folder', () => {
  // A picker and a workspace folder disagree about this often enough that the
  // comparison has to normalise, or re-choosing the open folder opens a second
  // window onto it.
  const d = decidePick({ ...base, chosen: '/work/a-project/', currentFolder: '/work/a-project' })
  assert.equal(d.action, 'nothing')
})

test('a folder with no manifest says what it found rather than appearing to work', () => {
  // The task that asks the questions is not written yet. A picker that accepts
  // anything and then does nothing is worse than one that refuses, because the
  // person believes it started.
  const d = decidePick({ ...base, hasManifest: false })
  assert.equal(d.action, 'refuse')
  assert.match(d.because ?? '', /\.code-server\.stack\.json/)
  // And it must not read as a defect in the extension.
  assert.doesNotMatch(d.because ?? '', /error|failed|broken/i)
})
