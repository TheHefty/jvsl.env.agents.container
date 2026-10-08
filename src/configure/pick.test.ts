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

test('a folder with no manifest is asked about rather than refused', () => {
  // **This asserted a refusal until the task that replaced it.** Refusing was
  // the right temporary answer while nothing could ask the questions about a
  // folder that is not open; `configure` takes a root now.
  const d = decidePick({ ...base, hasManifest: false })
  assert.equal(d.action, 'configure')
  assert.equal(d.folder, '/work/a-project')
  // The folder is named, so the output channel says which project is being
  // asked about — the questions themselves do not show a path.
  assert.match(d.because ?? '', /a-project/)
  // And it must not read as a defect in the extension.
  assert.doesNotMatch(d.because ?? '', /error|failed|broken/i)
})
