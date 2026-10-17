import {appendFileSync, readFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

import {api, git, pushCandidate, repository, run, sourceBranch, sourceVersion} from './releases.mjs'

const [directoryArgument] = process.argv.slice(2)
if (!directoryArgument || process.env.GITHUB_REPOSITORY !== repository) throw new Error('Expected a release directory in the fork workflow')
const directory = resolve(directoryArgument)
const source = JSON.parse(readFileSync(join(directory, 'source.json'), 'utf8'))
if (source.schema !== 1 || source.repository !== repository || source.branch !== sourceBranch || !sourceVersion(source.tag) || sourceVersion(source.tag) !== source.version) throw new Error('Invalid source metadata')
for (const sha of [source.commit, source.previous_commit, source.upstream.commit]) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid source commit')
}
if (source.commit !== process.env.TESTED_COMMIT) throw new Error('Source does not match the tested commit')

git('.', ['fetch', join(directory, 'source.bundle'), 'refs/heads/fork-candidate'])
if (git('.', ['rev-parse', 'FETCH_HEAD']) !== source.commit) throw new Error('Bundle does not match source metadata')
const currentMain = git('.', ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0]
if (currentMain !== process.env.GITHUB_SHA) throw new Error('Automation changed during validation; start a new run')

// One push either advances both refs or neither; a concurrent patch edit fails the lease.
pushCandidate('.', source)
run('gh', ['release', 'create', source.tag,
  join(directory, 'source.json'), join(directory, 'range-diff.txt'),
  '--repo', repository, '--verify-tag', '--draft', '--title', source.tag, '--notes-file', join(directory, 'notes.md'),
])
run('gh', ['release', 'edit', source.tag, '--repo', repository, '--draft=false', '--latest=false'])
if (!(await api(`repos/${repository}/releases/tags/${source.tag}`)).immutable) throw new Error('Published release is not immutable; enable release immutability before the next run')
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Published [${source.tag}](https://github.com/${repository}/releases/tag/${source.tag}) from \`${source.commit}\`.\n`)
