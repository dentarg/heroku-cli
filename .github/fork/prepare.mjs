import {appendFileSync, mkdirSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

import {api, checkWorkflowChanges, compareVersions, git, list, nextTag, parseVersion, rebase, repository, selectUpstream, sourceBranch, sourceVersion, upstreamRepository} from './releases.mjs'

const [checkoutArgument, outputArgument] = process.argv.slice(2)
if (!checkoutArgument || !outputArgument) throw new Error('Expected a source checkout and output directory')
const checkout = resolve(checkoutArgument)
const output = resolve(outputArgument)
mkdirSync(output, {recursive: true})

function setOutput(values) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''))
}

try {
  if (git(checkout, ['status', '--porcelain'])) throw new Error('Source checkout must be clean')
  const previous = git(checkout, ['rev-parse', 'HEAD'])
  const upstreamTag = selectUpstream(await list(`repos/${upstreamRepository}/releases`), process.env.UPSTREAM_TAG || '')
  const version = upstreamTag.slice(1)
  const ref = `refs/tags/upstream/${upstreamTag}`
  git(checkout, ['fetch', '--no-tags', `https://github.com/${upstreamRepository}.git`, `refs/tags/${upstreamTag}:${ref}`])
  const upstreamCommit = git(checkout, ['rev-parse', `${ref}^{commit}`])
  const base = git(checkout, ['merge-base', previous, upstreamCommit])
  const previousVersion = JSON.parse(git(checkout, ['show', `${base}:package.json`])).version
  parseVersion(previousVersion)
  if (compareVersions(version, previousVersion) < 0) throw new Error('Refusing an upstream downgrade')
  if (parseVersion(version)[0] !== parseVersion(previousVersion)[0] && !process.env.UPSTREAM_TAG) {
    throw new Error('Major upgrade requires a manual run with an explicit upstream_tag')
  }
  // A known release boundary prevents accidentally treating upstream commits as patches.
  const baseRef = `refs/tags/upstream/v${previousVersion}`
  git(checkout, ['fetch', '--no-tags', `https://github.com/${upstreamRepository}.git`, `refs/tags/v${previousVersion}:${baseRef}`])
  if (git(checkout, ['rev-parse', `${baseRef}^{commit}`]) !== base) throw new Error('local-fixes must be based on a stable upstream release tag')

  const releases = await list(`repos/${repository}/releases`)
  const reserved = (await api(`repos/${repository}/git/matching-refs/tags/dentarg-v`)).map(ref => ref.ref.slice('refs/tags/'.length))
  reserved.push(...releases.map(release => release.tag_name))
  if (base === upstreamCommit) {
    for (const release of releases.filter(release => !release.draft && !release.prerelease && release.immutable && sourceVersion(release.tag_name) === version)) {
      git(checkout, ['fetch', '--no-tags', 'origin', `refs/tags/${release.tag_name}:refs/tags/${release.tag_name}`])
      if (git(checkout, ['rev-parse', `refs/tags/${release.tag_name}^{commit}`]) === previous) {
        setOutput({changed: false})
        console.log(`${release.tag_name} already publishes ${previous}`)
        process.exit(0)
      }
    }
  }

  const candidate = rebase(checkout, base, upstreamCommit, report => {
    writeFileSync(join(output, 'range-diff.txt'), `${report}\n`)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Patch comparison for ${upstreamTag}\n\n\`\`\`text\n${report}\n\`\`\`\n`)
  })
  checkWorkflowChanges(checkout, previous, candidate.commit)
  const packageJson = JSON.parse(git(checkout, ['show', `${candidate.commit}:package.json`]))
  if (packageJson.name !== 'heroku' || packageJson.version !== version) throw new Error('Candidate package.json does not match the upstream release version')
  const tag = nextTag(version, reserved)
  const metadata = {
    schema: 1,
    repository,
    branch: sourceBranch,
    ...candidate,
    version,
    tag,
    upstream: {repository: upstreamRepository, tag: upstreamTag, commit: upstreamCommit},
  }
  writeFileSync(join(output, 'source.json'), `${JSON.stringify(metadata, null, 2)}\n`)
  writeFileSync(join(output, 'notes.md'), [
    `Heroku CLI ${version} with dentarg's patches.`, '',
    `Source commit: \`${candidate.commit}\`.`,
    `Upstream: ${upstreamRepository} \`${upstreamTag}\` (\`${upstreamCommit}\`).`, '',
    'Validated with lint, unit tests, and fork regression checks before publication.', '',
    ...candidate.patches.map(patch => `- ${patch.subject} (\`${patch.commit}\`)`), '',
  ].join('\n'))
  git(checkout, ['bundle', 'create', join(output, 'source.bundle'), 'refs/heads/fork-candidate'])
  setOutput({changed: true, commit: candidate.commit, tag})
  console.log(`Prepared ${tag} from ${candidate.commit}`)
} catch (error) {
  writeFileSync(join(output, 'failure.txt'), `${error.message}\n`)
  throw error
}
