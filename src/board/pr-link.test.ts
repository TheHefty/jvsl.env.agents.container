import { test } from 'node:test'
import assert from 'node:assert/strict'

import { originUrl, prLink } from './pr-link.ts'

/**
 * A task's pull request as a link (story nmf.3). Only a GitHub owner/repo and a
 * positive whole number make one: a link to the wrong place is worse than none.
 */
const GH = { text: '#278', href: 'https://github.com/TheHefty/jvsl.env.agents.container/pull/278' }

test('a GitHub origin in https, ssh or scp form gives the pull request\'s address', () => {
  for (const remote of [
    'https://github.com/TheHefty/jvsl.env.agents.container.git',
    'https://github.com/TheHefty/jvsl.env.agents.container',
    'git@github.com:TheHefty/jvsl.env.agents.container.git',
    'ssh://git@github.com/TheHefty/jvsl.env.agents.container.git',
  ]) assert.deepEqual(prLink(remote, 278), GH, remote)
})

test('another host, no remote, or a path that is not owner/repo gives the number as text only', () => {
  for (const remote of ['https://gitlab.com/a/b.git', 'git@example.com:a/b.git', undefined, 'https://github.com/only-owner', 'https://github.com/a/b/c']) {
    assert.deepEqual(prLink(remote, 7), { text: '#7' }, String(remote))
  }
})

test('a pr that is not a positive whole number makes nothing at all', () => {
  for (const pr of [0, -3, 2.5, 'abc', '12; rm', null, undefined, {}]) {
    assert.equal(prLink('https://github.com/a/b.git', pr), undefined, JSON.stringify(pr) ?? 'undefined')
  }
  assert.deepEqual(prLink('https://github.com/a/b.git', '12'), { text: '#12', href: 'https://github.com/a/b/pull/12' })
})

test('the origin is read from .git/config, and only the origin', () => {
  const config = [
    '[core]', '\trepositoryformatversion = 0',
    '[remote "upstream"]', '\turl = https://github.com/someone-else/fork.git',
    '[remote "origin"]', '\turl = git@github.com:TheHefty/jvsl.env.agents.container.git', '\tfetch = +refs/heads/*:refs/remotes/origin/*',
    '[branch "master"]', '\tremote = origin',
  ].join('\n')
  assert.equal(originUrl(config), 'git@github.com:TheHefty/jvsl.env.agents.container.git')
  assert.equal(originUrl('[remote "upstream"]\n\turl = x'), undefined)
  assert.equal(originUrl(null), undefined)
})
