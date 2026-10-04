/**
 * What to do with the folder a picker came back with.
 *
 * **`showOpenDialog` and `vscode.openFolder` are not testable without an
 * editor**, so the decision is a function over what the dialog returned and a
 * thin caller that performs it — the same split `decideOpen` uses, and the
 * reason anything about opening is testable in this repository at all.
 *
 * **It can only see this window's folder.** `vscode.workspace.workspaceFolders`
 * is the current window's; nothing exposes what other windows have open. So
 * "already open" means "open here", and choosing a folder that another window
 * has will open a second one onto it. Named rather than left as a surprise:
 * the alternative is pretending the check is stronger than it is.
 */
export interface Pick {
  /** What the dialog returned. `undefined` is a cancelled dialog. */
  chosen: string | undefined
  /** This window's folder, if it has one. Not other windows'. */
  currentFolder: string | undefined
  hasManifest: boolean
}

export type PickDecision =
  | { action: 'nothing'; because?: string }
  | { action: 'open'; folder: string; newWindow: boolean; because?: string }
  | { action: 'refuse'; because: string }

/** Trailing slashes: a dialog and a workspace folder disagree about them. */
function same(a: string, b: string): boolean {
  const trim = (p: string): string => p.replace(/\/+$/, '')
  return trim(a) === trim(b)
}

export function decidePick(pick: Pick): PickDecision {
  // A cancelled dialog is somebody changing their mind, not a failure. Saying
  // anything about it is the extension telling them off for using it.
  if (pick.chosen === undefined) return { action: 'nothing' }

  if (pick.currentFolder !== undefined && same(pick.chosen, pick.currentFolder)) {
    return { action: 'nothing', because: `${pick.chosen} is already open in this window.` }
  }

  if (!pick.hasManifest) {
    return {
      action: 'refuse',
      because:
        `${pick.chosen} has no \`.code-server.stack.json\`, so there is nothing yet that says ` +
        `which stacks its image should contain. Run \`Dev Container: Configure Stacks and ` +
        `Limits\` in it first — answering those questions is what writes that file.`,
    }
  }

  // **A new window whenever this one has a folder.** `openFolder` defaults to
  // replacing the current window, and an unsaved editor in an unrelated project
  // is somebody's work. Reusing an empty window loses nothing, so that case
  // does not accumulate windows for no reason.
  return { action: 'open', folder: pick.chosen, newWindow: pick.currentFolder !== undefined }
}
