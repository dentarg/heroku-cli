<div align="center">
  <img src="assets/Heroku-Logo-Mark-Light-RGB.svg" alt="Heroku logo" width="100">
  <p>&nbsp;</p>

  [![Node CI Suite](https://github.com/heroku/cli/actions/workflows/ci.yml/badge.svg)](https://github.com/heroku/cli/actions/workflows/ci.yml)
  [![npm](https://img.shields.io/npm/v/heroku.svg)](https://www.npmjs.com/package/heroku)
  [![ISC License](https://img.shields.io/github/license/heroku/cli.svg)](https://github.com/heroku/cli/blob/main/LICENSE)
</div>

Maintaining dentarg's fork
=========================

Install the released fork with `brew install dentarg/tap/heroku` and update it
with `brew upgrade dentarg/tap/heroku`.

- `main` contains the fork's maintenance workflows and scripts. Keep it as the
  default branch; GitHub schedules only run from the default branch.
- `local-fixes` contains the CLI patch stack on a stable upstream release. Add
  each local behavior change and its regression tests in one commit.
- `dentarg-vVERSION-REVISION` tags identify tested source snapshots. GitHub
  release immutability locks the tag and its `source.json` and `range-diff.txt`
  assets after publication. Never move or reuse these tags.

**Release fork source** runs daily at 02:23 UTC and can also be dispatched on
`main`. It finds the latest published stable upstream release, rebases an
isolated candidate, and compares the patch IDs before and after the rebase.
Conflicts, empty patches, changed patches, or a base that is not an upstream
release tag stop publication. Major upgrades require a manual run with an
explicit `upstream_tag`.

The candidate is transferred between jobs as a Git bundle. Linux and macOS jobs
install the committed dependency lock, run the unit suite and lint, and check
Git configuration preservation and update suppression. The regression checks
live on `main` so they survive changes to the patch stack. The publishing job
atomically updates `local-fixes` with an explicit force-with-lease and creates
the source tag, then publishes its immutable GitHub release. Only that job has
`contents: write`; no personal token, deploy key, or Heroku credentials are
needed. Repository rules must permit the bot to update `local-fixes` and create
release tags. Enable GitHub Actions and release immutability for this fork.

The tap polls published immutable source releases daily. Publishing a source
release does not dispatch another repository's workflow. A source commit already
published as an immutable release is a no-op. Changes to local patches can be
released by dispatching the workflow even when the upstream version is unchanged:

```sh
gh workflow run fork-release.yml --repo dentarg/heroku-cli --ref main
```

To select a stable release explicitly, including a reviewed major upgrade:

```sh
gh workflow run fork-release.yml --repo dentarg/heroku-cli --ref main \
  -f upstream_tag=v11.12.0
```

When a run stops, review its summary and the `fork-source` artifact. Resolve the
rebase on `local-fixes`, run the relevant tests, and push with
`git push --force-with-lease origin local-fixes`, then dispatch again. Review
patches implemented upstream before retiring them. The built-in `GITHUB_TOKEN`
cannot be granted workflow-file write permission, so upstream changes to
`.github/workflows` also require a reviewed manual rebase and push. This keeps
routine releases free of stored credentials without stripping upstream files.

An interrupted publication may reserve a tag or leave a draft release. Start a
new workflow run; it allocates a fresh revision and never overwrites the old tag
or assets. Do not rerun only the publishing job after it has pushed its tag.
The tag and source branch are updated together, and a concurrent source edit or
change to `main` prevents publication. Scheduled jobs can be delayed, and GitHub
can disable schedules after 60 days without repository activity; keep manual
dispatch available and check failed runs.

The Homebrew launcher sets `HEROKU_SKIP_NEW_VERSION_CHECK=true` to suppress npm
version checks and `HEROKU_DISABLE_AUTOUPDATE=true` to disable the separate
self-updater. Homebrew update behavior lives in the tap's launcher. The Git
configuration opt-out remains the fork's runtime patch.

Validate maintenance changes with:

```sh
node --test .github/fork/*.test.mjs
jactionlint .github/workflows/ci.yml .github/workflows/fork-release.yml
```

The fork's `main` CI tests the maintenance scripts. The source-release workflow
runs the CLI checks against the candidate source instead of the maintenance
branch. Upstream release workflows are not used to publish this fork.

When running `npm run test:ci:unit` locally on the source branch, unset
`NO_COLOR`: the upstream suite currently asserts ANSI color codes in a
validation error, and disabling color causes that assertion to fail.

Overview
========

The Heroku CLI is a command-line interface for managing Heroku applications and services. Built with Node.js and [oclif](https://oclif.io), it provides an extensible architecture for interacting with the Heroku platform.

For more about Heroku see <https://www.heroku.com/home>

To get started see <https://devcenter.heroku.com/start>

Key features of the CLI include:

- **App management** - Deploy, scale, and monitor your applications
- **Heroku Postgres database management** - Backup, restore, and manage Heroku Postgres databases
- **Heroku CI/CD pipelines** - Run automated tests and manage review apps for streamlined deployment workflows
- **Add-ons marketplace** - Provision and manage tools and services to extend your application
- **SSL certificates and domains** - Configure custom domains and automatically manage SSL/TLS certificates
- **Team collaboration** - Manage organization and team access with granular permissions
- **Private Spaces** - Deploy applications in network-isolated environments with VPN support
- **Logs and monitoring** - Stream application logs and forward them to external services
- **Plugin ecosystem** - Extend functionality with community and custom plugins

For more on developing plugins, read [Developing CLI Plugins](https://devcenter.heroku.com/articles/developing-cli-plugins)

Issues
======

For problems directly related to the CLI, [add an issue on GitHub](https://github.com/heroku/cli/issues/new).

For other issues, [submit a support ticket](https://help.heroku.com/).

[Contributors](https://github.com/heroku/cli/contributors)

<!-- commands -->
# Command Topics

* [`heroku access`](docs/access.md) - manage user access to apps
* [`heroku accounts`](docs/accounts.md) - list the Heroku accounts in your cache
* [`heroku addons`](docs/addons.md) - tools and services for developing, extending, and operating your app
* [`heroku apps`](docs/apps.md) - manage apps on Heroku
* [`heroku auth`](docs/auth.md) - manage authentication for your Heroku account
* [`heroku authorizations`](docs/authorizations.md) - OAuth authorizations
* [`heroku autocomplete`](docs/autocomplete.md) - display autocomplete installation instructions
* [`heroku buildpacks`](docs/buildpacks.md) - scripts used to compile apps
* [`heroku certs`](docs/certs.md) - SSL certificates
* [`heroku ci`](docs/ci.md) - test runner for Heroku Pipelines
* [`heroku clients`](docs/clients.md) - OAuth clients on the platform
* [`heroku config`](docs/config.md) - environment variables of apps
* [`heroku container`](docs/container.md) - deploy your Docker-based app to Heroku
* [`heroku data`](docs/data.md) - list maintenances for an app's data addons
* [`heroku domains`](docs/domains.md) - custom domains for apps
* [`heroku drains`](docs/drains.md) - forward logs to syslog or HTTPS
* [`heroku features`](docs/features.md) - add/remove app features
* [`heroku git`](docs/git.md) - set git remote and clone Heroku repository
* [`heroku help`](docs/help.md) - Display help for heroku.
* [`heroku keys`](docs/keys.md) - add/remove account ssh keys
* [`heroku labs`](docs/labs.md) - add/remove experimental features
* [`heroku local`](docs/local.md) - run Heroku app locally
* [`heroku logs`](docs/logs.md) - display recent log output
* [`heroku maintenance`](docs/maintenance.md) - enable/disable access to app
* [`heroku mcp`](docs/mcp.md) - starts the Heroku platform MCP server in stdio mode
* [`heroku members`](docs/members.md) - manage organization members
* [`heroku notifications`](docs/notifications.md) - display notifications
* [`heroku orgs`](docs/orgs.md) - manage organizations
* [`heroku pg`](docs/pg.md) - manage postgresql databases
* [`heroku pipelines`](docs/pipelines.md) - manage pipelines
* [`heroku plugins`](docs/plugins.md) - List installed plugins.
* [`heroku ps`](docs/ps.md) - manage app dynos
* [`heroku redis`](docs/redis.md) - manage heroku redis instances
* [`heroku regions`](docs/regions.md) - list available regions for deployment
* [`heroku releases`](docs/releases.md) - display the releases for an app
* [`heroku repl`](docs/repl.md) - enter an interactive REPL session to run Heroku CLI commands
* [`heroku reviewapps`](docs/reviewapps.md) - manage reviewapps in pipelines
* [`heroku run`](docs/run.md) - run a one-off process inside a Heroku dyno
* [`heroku search`](docs/search.md) - Search for a command.
* [`heroku sessions`](docs/sessions.md) - OAuth sessions
* [`heroku spaces`](docs/spaces.md) - list available spaces
* [`heroku status`](docs/status.md) - display current status of the Heroku platform
* [`heroku teams`](docs/teams.md) - manage teams
* [`heroku telemetry`](docs/telemetry.md) - list telemetry drains
* [`heroku update`](docs/update.md) - update the Heroku CLI
* [`heroku usage`](docs/usage.md) - list usage for metered add-ons attached to an app or apps within a team
* [`heroku version`](docs/version.md) - display changelog information for a specific CLI version
* [`heroku webhooks`](docs/webhooks.md) - list webhooks on an app

<!-- commandsstop -->

Developing
==========


After cloning the repo
1. Run `npm install` to install dependencies
2. Run `npm run build` to build the CLI. This will need to be re-run any time you make changes and want to test them locally.

To execute Heroku CLI commands locally, use `./bin/run <command>`. For example, to run the `heroku apps` command with your local code, run `./bin/run apps` from the root directory.

Testing
=======

Run all tests with `npm test`.

## Debugging

Using WebStorm (from JetBrains / IntelliJ), you can run/debug an individual test case.

- Create a new run/debug configuration
- Select the 'Mocha' type

Contributing
=========

Please review our [Contributing guidelines](./CONTRIBUTING.md) as well as our [PR template](./.github/PULL_REQUEST_TEMPLATE.md).
