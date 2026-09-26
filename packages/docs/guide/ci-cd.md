---
title: GitHub Actions Workflows
description: Automated CI/CD workflows for the wizard-vite monorepo
---


# GitHub Actions Workflows

This directory contains automated CI/CD workflows for the wizard-vite monorepo.

## Workflows

### 1. CI (`ci.yml`)

Runs on every push to `main`/`develop` branches and on all pull requests.

**Jobs:**

- **Lint** - Runs Biome linter, Knip (unused deps), and Syncpack (version consistency)
- **Type Check** - Runs TypeScript type checking across all packages
- **Build** - Builds all packages and uploads artifacts
- **Test** - Runs tests on Node 18, 20, and 22

### 2. Changesets release (`changesets.yml`)

Versions and publishes packages. Runs on every push to `main` and on manual dispatch.

**What it does** (one job, `changesets/action@v1`):

- **Pending changesets** - runs `pnpm changeset:version` and opens or updates the "Version Packages" PR.
- **No changesets** (i.e. after the Version Packages PR is merged) - builds, runs tests, publishes every package whose version is not on npm yet, then pushes release tags and creates GitHub releases.

The job has `contents: write`, `pull-requests: write` and `id-token: write`. `changesets/action@v2` would split versioning and publishing into separate jobs, so that only publishing gets `id-token`, but it requires `@changesets/cli` v3. The repo is on CLI v2.

**Authentication: npm trusted publishing (OIDC).** There is no npm token. Each package has a trusted publisher on npmjs.com for repository `gooonzick/wizard` and workflow file `changesets.yml`. At publish time npm exchanges the GitHub OIDC token for a short-lived credential and attaches provenance automatically. This needs a GitHub-hosted runner and npm >= 11.5.1 (the job runs Node 24 and pins npm explicitly, because pnpm 10 delegates `pnpm publish` to the npm CLI).

> **Do not rename `changesets.yml`.** The trusted publisher is bound to the file name; a rename breaks publishing until every package's trusted publisher is updated. npm allows one trusted publisher per package, so no other workflow can publish.

**Manual re-run:** Actions → Changesets → Run workflow. In `publish` mode it retries publishing any version that is not on npm yet (for example after a failed publish).

### 3. PR Checks (`pr-checks.yml`)

Additional checks for pull requests.

**Jobs:**

- **Bundle Size Check** - Reports bundle sizes in PR
- **Validate package.json** - Ensures all package.json files are valid
- **PR Labeler** - Auto-labels PRs based on changed files

### 4. Release (`release.yml`)

Creates GitHub releases from git tags.

**Tag Formats:**

- `v*.*.*` - Release all packages
- `@gooonzick/wizard-core@*` - Release core package only
- `@gooonzick/wizard-react@*` - Release React package only
- `@gooonzick/wizard-vue@*` - Release Vue package only
- `@gooonzick/wizard-svelte@*` - Release Svelte package only
- `@gooonzick/wizard-solid@*` - Release Solid package only

**Features:**

- ✅ Auto-generates release notes
- ✅ Marks pre-releases (beta, alpha, rc)
- ✅ Links to documentation

## Setup Instructions

### 1. Configure npm trusted publishing

For each package (`@gooonzick/wizard-core`, `-react`, `-vue`, `-state`, `-svelte`, `-solid`):

1. On npmjs.com open the package → **Settings** → **Trusted Publisher** → **GitHub Actions**, and enter:
   - Organization or user: `gooonzick`
   - Repository: `wizard`
   - Workflow filename: `changesets.yml`
   - Environment: leave empty
2. Or, with npm >= 11.15 and a logged-in account that has 2FA enabled:

   ```bash
   npm trust github @gooonzick/wizard-core --repo gooonzick/wizard --file changesets.yml --allow-publish
   ```

A brand-new package must exist on npm before a trusted publisher can be configured, so its first version has to be published once by other means.

After trusted publishing works, the recommended hardening is package **Settings → Publishing access → "Require two-factor authentication and disallow tokens"**, and deleting any old `NPM_TOKEN` secret.

### 2. Configure Codecov (Optional)

1. Sign up at https://codecov.io
2. Add your repository
3. Get the upload token
4. Add to GitHub secrets as `CODECOV_TOKEN`

### 3. Enable GitHub Actions

Ensure GitHub Actions is enabled in repository Settings → Actions → General.

## Publishing Workflow

1. In a feature PR, add a changeset: `pnpm changeset` (choose packages and bump type). All publishable packages are in one fixed version group, so they always release together.
2. Merge the PR to `main`. The Changesets workflow opens or updates the **Version Packages** PR with the version bumps and CHANGELOG entries.
3. Merge the Version Packages PR. The workflow publishes the new versions to npm via trusted publishing, pushes `@gooonzick/wizard-<name>@<version>` tags and creates GitHub releases.

## Testing Locally

Before pushing, test your changes locally:

```bash
# Run all CI checks
pnpm lint
pnpm typecheck
pnpm build
pnpm test

# Check for issues
pnpm knip
pnpm syncpack:lint
```

## Workflow Status Badges

Add to your README.md:

```markdown
![CI](https://github.com/YOUR_USERNAME/wizard-vite/actions/workflows/ci.yml/badge.svg)
[![codecov](https://codecov.io/gh/YOUR_USERNAME/wizard-vite/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/wizard-vite)
```

## Troubleshooting

### Publish fails with E404 / E401 / "need auth"

- Check the package's trusted publisher on npmjs.com: repository `gooonzick/wizard` and workflow `changesets.yml` must match exactly (case-sensitive, including `.yml`).
- Make sure the publish job still has `permissions: id-token: write` and runs on a GitHub-hosted runner.
- Make sure npm on the runner is >= 11.5.1 (see the "Update npm" step).
- A new package needs its first version published before a trusted publisher can be added.

### Tests fail on specific Node version

- Check package.json engines field
- Update Node version matrix in ci.yml if needed

### Bundle size check fails

- Ensure build completed successfully
- Check dist/ directories exist
- Install `bc` if running locally: `apt-get install bc`

## Best Practices

1. **Always run tests locally** before pushing
2. **Use semantic versioning** for releases
3. **Write meaningful commit messages** for changelog generation
4. **Test workflows** in a fork before merging to main
5. **Review bundle sizes** in PR checks before merging
