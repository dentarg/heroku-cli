import assert from 'node:assert/strict'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'

import {checkWorkflowChanges, git, nextTag, pushCandidate, rebase, selectUpstream} from './releases.mjs'

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'heroku-rebase-test-'))
  t.after(() => rmSync(directory, {recursive: true, force: true}))
  git(directory, ['init', '--initial-branch=main'])
  git(directory, ['config', 'user.name', 'Test'])
  git(directory, ['config', 'user.email', 'test@example.com'])
  const commit = (file, contents, message) => {
    writeFileSync(join(directory, file), contents)
    git(directory, ['add', file])
    git(directory, ['commit', '-m', message])
    return git(directory, ['rev-parse', 'HEAD'])
  }
  const base = commit('behavior.txt', 'before\n', 'Initial behavior')
  git(directory, ['switch', '-c', 'local-fixes'])
  const patch = commit('behavior.txt', 'after\n', 'Preserve local behavior')
  git(directory, ['switch', 'main'])
  return {directory, base, patch, commit}
}

test('replays the complete patch stack on upstream and preserves its patch IDs', t => {
  const {directory, base, patch, commit} = fixture(t)
  const upstream = commit('upstream.txt', 'new release\n', 'Upstream release')
  git(directory, ['switch', 'local-fixes'])
  let report
  const candidate = rebase(directory, base, upstream, value => { report = value })
  assert.equal(candidate.previous_commit, patch)
  assert.notEqual(candidate.commit, patch)
  assert.equal(candidate.patches.length, 1)
  assert.equal(git(directory, ['show', `${candidate.commit}:behavior.txt`]), 'after')
  assert.equal(git(directory, ['rev-parse', `${candidate.commit}^`]), upstream)
  assert.match(report, /Preserve local behavior/)
  assert.equal(git(directory, ['rev-parse', 'local-fixes']), patch)
})

test('stops when upstream already contains a local patch instead of dropping it', t => {
  const {directory, base, commit} = fixture(t)
  const upstream = commit('behavior.txt', 'after\n', 'Upstream implements the same fix')
  git(directory, ['switch', 'local-fixes'])
  assert.throws(() => rebase(directory, base, upstream, () => {}))
  assert.equal(git(directory, ['rev-parse', 'local-fixes']), git(directory, ['rev-parse', 'fork-candidate']))
})

test('publishes the branch and tag atomically and rejects a concurrent source edit', t => {
  const {directory, patch, commit} = fixture(t)
  const remote = join(directory, 'remote.git')
  git(directory, ['init', '--bare', remote])
  git(directory, ['remote', 'add', 'origin', remote])
  git(directory, ['push', 'origin', 'local-fixes'])
  git(directory, ['switch', 'local-fixes'])
  const candidate = commit('next.txt', 'next\n', 'Next patch')
  pushCandidate(directory, {tag: 'dentarg-v1.0.0-1', commit: candidate, previous_commit: patch})
  assert.equal(git(remote, ['rev-parse', 'refs/heads/local-fixes']), candidate)
  assert.equal(git(remote, ['rev-parse', 'refs/tags/dentarg-v1.0.0-1']), candidate)

  const concurrent = commit('another.txt', 'another\n', 'Concurrent edit')
  git(directory, ['push', 'origin', 'local-fixes'])
  assert.throws(() => pushCandidate(directory, {tag: 'dentarg-v1.0.0-2', commit: patch, previous_commit: candidate}))
  assert.equal(git(remote, ['rev-parse', 'refs/heads/local-fixes']), concurrent)
  assert.equal(git(remote, ['tag', '--list', 'dentarg-v1.0.0-2']), '')
})

test('selects stable releases numerically and never reuses reserved revisions', () => {
  const release = (tag_name, extra = {}) => ({tag_name, ...extra})
  const releases = [release('v11.9.0'), release('v11.12.0'), release('v12.0.0-beta.1'), release('v12.0.0', {draft: true})]
  assert.equal(selectUpstream(releases), 'v11.12.0')
  assert.equal(selectUpstream(releases, 'v11.9.0'), 'v11.9.0')
  assert.throws(() => selectUpstream(releases, 'v12.0.0'), /published stable/)
  assert.equal(nextTag('11.12.0', ['v11.12.0', 'dentarg-v11.12.0-2', 'dentarg-v11.12.0-10', 'dentarg-v11.11.0-99']), 'dentarg-v11.12.0-11')
  assert.equal(nextTag('11.13.0', ['dentarg-v11.12.0-10']), 'dentarg-v11.13.0-1')
})

test('stops before publishing new workflow files with the built-in token', t => {
  const {directory, base, patch, commit} = fixture(t)
  mkdirSync(join(directory, '.github/workflows'), {recursive: true})
  const upstream = commit('.github/workflows/upstream.yml', 'name: upstream\n', 'Add upstream workflow')
  git(directory, ['switch', 'local-fixes'])
  const candidate = rebase(directory, base, upstream, () => {})
  assert.throws(() => checkWorkflowChanges(directory, patch, candidate.commit), /workflow-file write permission/)
  assert.doesNotThrow(() => checkWorkflowChanges(directory, candidate.commit, candidate.commit))
})
