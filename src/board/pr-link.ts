/**
 * A task's pull request, from its metadata `pr` and the project's origin
 * remote (story nmf.3). **Only a GitHub owner/repo and a positive whole number
 * make a link**: anything else is the number as text, or nothing, because a
 * link to the wrong place reads as right.
 */
export function prLink(remote: string | undefined, pr: unknown): { text: string; href?: string } | undefined {
  const n = typeof pr === 'number' ? pr : typeof pr === 'string' && /^\d+$/.test(pr) ? Number(pr) : NaN
  if (!Number.isInteger(n) || n <= 0) return undefined
  const m = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(remote ?? '')
  if (m === null) return { text: `#${n}` }
  return { text: `#${n}`, href: `https://github.com/${m[1]}/${m[2]}/pull/${n}` }
}

/** The origin remote's URL, from the text of .git/config; no other remote. */
export function originUrl(gitConfig: string | null): string | undefined {
  if (gitConfig === null) return undefined
  let inOrigin = false
  for (const raw of gitConfig.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('[')) { inOrigin = line === '[remote "origin"]'; continue }
    const m = /^url\s*=\s*(.+)$/.exec(line)
    if (inOrigin && m) return m[1]!.trim()
  }
  return undefined
}
