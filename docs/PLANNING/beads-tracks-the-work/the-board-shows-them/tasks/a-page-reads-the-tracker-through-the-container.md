# Task: a page reads the tracker through the container

| | |
|---|---|
| **Story** | `the-board-shows-them` |
| **Date** | 2026-10-07 |

## Summary

A command, **Agent Container: Show the Work**, opens a webview with two tabs — columns by state, and
the hierarchy as a tree — fed by one `bd export` run inside the project's container. Opening an item
shows its full text, rendered by VS Code's own Markdown renderer. The page reads and writes nothing,
and its content cannot run. FR-118 and FR-119.

## Problem

The extension runs on the host, measured on the operator's machine on 2026-10-06. The tracker lives
in the container, and only the bd the image pins should read it. In a window connected to the
container, the workspace folder is the container's path, `/config/workspace`, which names nothing on
the host.

## Proposal

**Finding the container.** Dev Containers labels each container with
`devcontainer.local_folder=<host path>`. The host path comes from the workspace folder in a local
window, and from the remote authority in a connected one: `dev-container+<hex>`, where the hex is
either the host path or a JSON object carrying `hostPath`. Both forms are decoded. Exactly one
running container must carry the label; none means the container is stopped, and more than one is
refused by name rather than guessed between.

**Reading.** One command, bounded in time:

```
docker exec -u abc -e HOME=/config -w /config/workspace <container> bd export
```

Measured against bd v1.3.1: one JSON object per line, carrying status, labels, description,
acceptance criteria, design, close reason and dependencies. The hierarchy is the `parent-child`
dependencies, and "blocked" is an open item with a `blocks` dependency on one not closed. `bd export`
only reads; it is the one bd command the page runs.

**Showing.** One reading feeds both tabs:

| Tab | What it shows |
|---|---|
| **Board** | columns: Proposals, Open, In progress, Blocked, Deferred, Closed. A proposal is its own column whatever its stored state, because it is not work |
| **Tree** | epics, then their stories, then their tasks, with the state on each row; items with no parent at the root |

Every row shows its kind of debt (`hotfix`, `shortcut`, `defect`) where it has one. Opening an item
shows its description, acceptance criteria, design and close reason, each rendered with
`markdown.api.render`. If that command is unavailable, the text is shown as plain text and the page
says why.

**Safety.** The webview's Content Security Policy is `default-src 'none'`, with the page's one script
allowed by a nonce, styles from the page itself, and no images, fonts, frames or connections from
anywhere. Rendered item text never carries the nonce, so a `<script>` inside it does not run, and
nothing in it can load. The page has no control that changes an item.

**`docker` output is allowed 64 MiB**, raised in `dockerBounded` for every call. Node's default is
1 MiB, and a whole tracker can pass that and fail as "maxBuffer exceeded".

**States the page says, in words:** no folder open; a project with no tracker, and how to ask for
one; the container is not running, and that the tracker is read from inside it; the reading failed,
with the command's own error; the reading timed out.

**Code.** The decisions are pure functions in `src/board-locate.ts`, `src/board-read.ts` and
`src/board-page.ts`, with the editor shell in `src/board.ts`. **Flat, not a `src/board/` folder**, a
change made while implementing: `npm test` runs `src/*.test.ts` and every source guard reads
`src/*.ts`, so files in a subfolder would have been silently untested and unguarded. The pure
functions have unit tests — decoding the
authority, choosing the container, parsing the export, building the columns and the tree, building
the page's HTML. The panel and the command are a thin shell around them, registered in `activate()`
like the others and awaiting nothing there.

## Three worst failure scenarios

| # | Scenario | How it manifests | Test that catches it |
|---|---|---|---|
| 1 | **An item's text runs in the page.** Rendered Markdown carries a script, an event handler or a remote load | content somebody wrote executes with the extension's webview, or reaches the network | a unit test of the page builder: the CSP is exactly as above, the nonce appears only on the page's own script, and an item whose text holds `<script>`, `onerror=` and a remote `<img>` produces HTML whose only nonce-bearing script is the page's |
| 2 | **The board shows another project's work.** The authority is decoded wrongly, or two containers match | the operator reads and approves the wrong project's proposals | unit tests: both authority forms decode to the host path; a lookup matching more than one container refuses and names them; one matching none says the container is not running |
| 3 | **The editor waits on the board, or the board writes.** The `docker exec` hangs on a stopped daemon, or a second bd command creeps in | a page that never answers, or a "read-only" page that changes the tracker | the existing guard `no-unbounded-docker-call.test.sh` covers the new call; `scripts/board-only-reads.test.sh` fails if `src/board*.ts` names, in code, any bd subcommand other than `export` |

## Blast radius

- **New:** `src/board*.ts` and their tests, one command in `package.json`, one entry in the Agent
  Container panel, and the new guard with its CI job.
- **Touched:** `src/extension.ts` registers the command; `scripts/command-names-are-current.test.sh`
  and `src/manifest.test.ts` learn the new command.
- **No runtime dependency is added.** Rendering is VS Code's own.

## Alternatives considered

- **A bundled Markdown renderer**, or **plain text**. Declined by the operator: the first adds the
  extension's first runtime dependency, the second contradicts the agreed scenarios.
- **`bd` on the host**, or **a snapshot kept on the host**. Declined at the story gate.
- **One `bd show` per item.** One `bd export` returns every field the page needs, in one call.

## Verification

- Unit tests for every pure function, run by `npm test`; the bundle test confirms the command is
  registered at activation.
- **By hand, on the operator's host:** the remote authority decoding against a real connected
  window, and the story's two `@manual` scenarios.

## Open questions

None.

## Outcome

Filled in when the task closes.
