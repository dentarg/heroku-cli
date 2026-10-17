import {execFileSync} from 'node:child_process'

export const repository = 'dentarg/heroku-cli'
export const upstreamRepository = 'heroku/cli'
export const sourceBranch = 'local-fixes'
const versionPattern = '(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)'

export function parseVersion(version) {
  if (!new RegExp(`^${versionPattern}$`).test(version)) throw new Error(`Invalid stable version: ${version}`)
  const parts = version.split('.').map(Number)
  if (!parts.every(Number.isSafeInteger)) throw new Error('Version is too large')
  return parts
}

export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

export function sourceVersion(tag) {
  const match = new RegExp(`^dentarg-v(${versionPattern})-([1-9]\\d*)$`).exec(tag)
  return match?.[1]
}

export function selectUpstream(releases, requested = '') {
  const stable = releases.filter(release => !release.draft && !release.prerelease && new RegExp(`^v${versionPattern}$`).test(release.tag_name))
  const selected = requested
    ? stable.find(release => release.tag_name === requested)
    : stable.sort((a, b) => compareVersions(b.tag_name.slice(1), a.tag_name.slice(1)))[0]
  if (!selected) throw new Error('No matching published stable upstream release')
  return selected.tag_name
}

export function nextTag(version, reserved) {
  parseVersion(version)
  let revision = 0
  for (const tag of reserved) {
    if (sourceVersion(tag) === version) revision = Math.max(revision, Number(tag.split('-').at(-1)))
  }
  if (!Number.isSafeInteger(revision + 1)) throw new Error('Source revision is too large')
  return `dentarg-v${version}-${revision + 1}`
}

export function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
    env: {...process.env, HUSKY: '0', GIT_TERMINAL_PROMPT: '0', ...options.env},
  }).trim()
}

export function git(checkout, args, options = {}) {
  return run('git', ['-c', 'core.hooksPath=/dev/null', ...args], {cwd: checkout, ...options})
}

export async function api(path) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const response = await fetch(`https://api.github.com/${path}`, {
    headers: {accept: 'application/vnd.github+json', ...(token ? {authorization: `Bearer ${token}`} : {})},
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`GitHub API ${path}: ${response.status}`)
  return response.json()
}

export async function list(path) {
  const items = []
  for (let page = 1; ; page++) {
    const batch = await api(`${path}?per_page=100&page=${page}`)
    items.push(...batch)
    if (batch.length < 100) return items
  }
}

export function patches(checkout, base, head) {
  const range = `${base}..${head}`
  if (git(checkout, ['rev-list', '--merges', range])) throw new Error('The patch stack must not contain merge commits')
  const commits = git(checkout, ['rev-list', '--reverse', range])
  return commits ? commits.split('\n').map(commit => {
    const diff = git(checkout, ['show', '--format=', '--no-ext-diff', '--binary', commit])
    const patch_id = git(checkout, ['patch-id', '--stable'], {input: `${diff}\n`, stdio: ['pipe', 'pipe', 'inherit']}).split(' ')[0]
    if (!patch_id) throw new Error(`Empty patch: ${commit}`)
    return {commit, patch_id, subject: git(checkout, ['show', '-s', '--format=%s', commit])}
  }) : []
}

export function rebase(checkout, base, target, report) {
  const previous = git(checkout, ['rev-parse', 'HEAD'])
  const before = patches(checkout, base, previous)
  git(checkout, ['switch', '-C', 'fork-candidate', previous])
  // Never silently discard a patch that upstream has independently implemented.
  git(checkout, ['-c', 'rebase.updateRefs=false', 'rebase', '--no-autosquash', '--reapply-cherry-picks', '--empty=stop', '--onto', target, base], {
    env: {GIT_EDITOR: 'true', GIT_COMMITTER_NAME: 'github-actions[bot]', GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com'},
  })
  const commit = git(checkout, ['rev-parse', 'HEAD'])
  const after = patches(checkout, target, commit)
  report(git(checkout, ['range-diff', '--no-color', `${base}..${previous}`, `${target}..${commit}`]))
  if (JSON.stringify(before.map(patch => patch.patch_id)) !== JSON.stringify(after.map(patch => patch.patch_id))) {
    throw new Error('Patches changed during rebase. Review range-diff, rebase local-fixes manually, then run again.')
  }
  return {commit, previous_commit: previous, patches: after}
}

export function pushCandidate(checkout, source) {
  git(checkout, ['tag', source.tag, source.commit])
  git(checkout, ['push', '--atomic', `--force-with-lease=refs/heads/${sourceBranch}:${source.previous_commit}`, 'origin', `${source.commit}:refs/heads/${sourceBranch}`, `refs/tags/${source.tag}`])
}

export function checkWorkflowChanges(checkout, previous, commit) {
  const changed = git(checkout, ['diff', '--name-only', previous, commit, '--', '.github/workflows'])
  if (changed) {
    throw new Error(`Upstream changed workflow files:\n${changed}\nGITHUB_TOKEN has no workflow-file write permission. Review and push the rebase to local-fixes manually, then dispatch again.`)
  }
}
