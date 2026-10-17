// These checks live with the automation so a rebase cannot silently drop them.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

const [checkoutArgument] = process.argv.slice(2)
if (!checkoutArgument) throw new Error('Expected a built CLI checkout')
const checkout = resolve(checkoutArgument)
const temporary = mkdtempSync(join(tmpdir(), 'heroku-fork-check-'))
try {
  const {default: Git} = await import(pathToFileURL(join(checkout, 'dist/lib/git/git.js')))
  const git = new Git()
  let gitCalls = 0
  git.exec = async () => { gitCalls++ }
  const previous = process.env.HEROKU_DISABLE_GIT_CONFIG
  process.env.HEROKU_DISABLE_GIT_CONFIG = '1'
  try {
    await git.configureCredentialHelper()
    await git.removeCredentialHelper()
    assert.equal(gitCalls, 0, 'Git configuration opt-out must cover setup and removal')
  } finally {
    if (previous === undefined) delete process.env.HEROKU_DISABLE_GIT_CONFIG
    else process.env.HEROKU_DISABLE_GIT_CONFIG = previous
  }

  const cache = join(temporary, 'cache')
  mkdirSync(cache)
  const versionFile = join(cache, 'version')
  writeFileSync(versionFile, JSON.stringify({latest: '999999.0.0'}))
  utimesSync(versionFile, new Date(0), new Date(0))
  const gitconfig = join(temporary, 'gitconfig')
  const original = '# user-managed Git configuration\n'
  writeFileSync(gitconfig, original)
  const preload = join(temporary, 'observe.mjs')
  writeFileSync(preload, `import cp from 'node:child_process'
import {syncBuiltinESMExports} from 'node:module'
const spawn = cp.spawn
cp.spawn = (command, args, options) => {
  if (args?.some(arg => String(arg).endsWith('/lib/get-version') || arg === '--autoupdate')) {
    process.stderr.write('UNEXPECTED_BACKGROUND_UPDATE\\n')
    return {unref() {}, on() { return this }}
  }
  return spawn(command, args, options)
}
syncBuiltinESMExports()
`)
  const env = {
    ...process.env,
    DISABLE_TELEMETRY: 'true',
    GIT_CONFIG_GLOBAL: gitconfig,
    HEROKU_CACHE_DIR: cache,
    HEROKU_CONFIG_DIR: join(temporary, 'config'),
    HEROKU_DATA_DIR: join(temporary, 'data'),
    HEROKU_DISABLE_AUTOUPDATE: 'true',
    HEROKU_DISABLE_GIT_CONFIG: '1',
    HEROKU_SKIP_NEW_VERSION_CHECK: 'true',
    HEROKU_UPDATE_INSTRUCTIONS: 'update with: brew upgrade dentarg/tap/heroku',
  }
  delete env.HEROKU_FORCE_VERSION_CACHE_UPDATE
  const result = spawnSync(process.execPath, ['--import', preload, 'bin/run.js', 'commands', '--json'], {
    cwd: checkout, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60000,
  })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  assert(JSON.parse(result.stdout).some(command => command.id === 'apps'))
  assert.doesNotMatch(result.stderr, /update available from|UNEXPECTED_BACKGROUND_UPDATE/)
  assert.equal(readFileSync(gitconfig, 'utf8'), original)
  console.log('Git opt-out, command discovery, and update suppression passed')
} finally {
  rmSync(temporary, {recursive: true, force: true})
}
