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

### 2. Publish (`publish.yml`)

Publishes packages to npm registry.

**Triggers:**

- GitHub Release published
- Manual workflow dispatch (allows selecting specific package)

**Options:**

- `package` - Which package to publish (all, core, react, vue)
- `tag` - npm dist-tag (latest, next, beta)

**Features:**

- ✅ npm provenance support
- ✅ Runs tests before publishing
- ✅ Publishes with proper access control
- ✅ Creates summary in GitHub Actions

**Required Secrets:**

- `NPM_TOKEN` - npm authentication token with publish access

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

**Features:**

- ✅ Auto-generates release notes
- ✅ Marks pre-releases (beta, alpha, rc)
- ✅ Links to documentation

## Setup Instructions

### 1. Configure npm Token

1. Generate an npm access token at https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Select "Automation" token type
   - Enable "Publish" permission
2. Add the token to GitHub repository secrets:
   - Go to repository Settings → Secrets and variables → Actions
   - Create new secret named `NPM_TOKEN`
   - Paste your npm token

### 2. Configure Codecov (Optional)

1. Sign up at https://codecov.io
2. Add your repository
3. Get the upload token
4. Add to GitHub secrets as `CODECOV_TOKEN`

### 3. Enable GitHub Actions

Ensure GitHub Actions is enabled in repository Settings → Actions → General.

## Publishing Workflow

### Automated Publishing (Recommended)

1. Update version in package.json:

   ```bash
   # For all packages
   pnpm version patch  # or minor, major

   # For specific package
   cd packages/core
   pnpm version patch
   ```

2. Create and push a git tag:

   ```bash
   # For all packages
   git tag v1.2.3
   git push origin v1.2.3

   # For specific package
   git tag @gooonzick/wizard-core@1.2.3
   git push origin @gooonzick/wizard-core@1.2.3
   ```

3. Create a GitHub Release from the tag
4. Publish workflow will automatically run

### Manual Publishing

1. Go to Actions → Publish to npm
2. Click "Run workflow"
3. Select package and npm tag
4. Click "Run workflow"

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

### Publish fails with "need auth"

- Verify `NPM_TOKEN` secret is set correctly
- Ensure token has publish permissions
- Check token hasn't expired

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
