# Contributing to WizardForm

Thank you for considering contributing to WizardForm! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project follows a standard code of conduct. Be respectful, inclusive, and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Git

### Setup

1. Fork the repository on GitHub
2. Clone your fork locally:

   ```bash
   git clone https://github.com/YOUR_USERNAME/wizard-vite.git
   cd wizard-vite
   ```

3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Create a new branch:
   ```bash
   git checkout -b feature/my-new-feature
   ```

### Monorepo Structure

```
wizard-vite/
├── packages/
│   ├── core/       # @gooonzick/wizard-core - Framework-agnostic core
│   ├── react/      # @gooonzick/wizard-react - React integration
│   └── vue/        # @gooonzick/wizard-vue - Vue integration
├── examples/       # Example applications
└── docs/          # Documentation
```

## Development Workflow

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests for specific package
pnpm --filter=@gooonzick/wizard-core test
pnpm --filter=@gooonzick/wizard-react test
pnpm --filter=@gooonzick/wizard-vue test
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter=@gooonzick/wizard-core build
```

### Linting and Formatting

```bash
# Lint all files
pnpm lint

# Auto-fix linting issues
pnpm lint:fix

# Type check
pnpm typecheck

# Check for unused dependencies
pnpm knip

# Check dependency version consistency
pnpm syncpack:lint
```

### Running Examples

```bash
# Run React example
pnpm dev
```

## Pull Request Process

### Before Submitting

1. **Run all checks locally:**

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm build
   pnpm test
   ```

2. **Update documentation** if you've changed APIs or added features

3. **Add or update tests** for your changes

4. **Update CHANGELOG.md** under `[Unreleased]` section

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add support for async guards
fix(react): resolve memory leak in useWizard hook
docs(vue): update README with new examples
test(core): add tests for transition resolvers
chore: update dependencies
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `test`: Adding or updating tests
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `chore`: Maintenance tasks

Scopes:

- `core`: Changes to @gooonzick/wizard-core
- `react`: Changes to @gooonzick/wizard-react
- `vue`: Changes to @gooonzick/wizard-vue
- `examples`: Changes to examples
- `ci`: Changes to CI/CD

### PR Title

Use the same format as commit messages:

```
feat(react): add granular hooks for performance optimization
```

### PR Description Template

```markdown
## Description

Brief description of what this PR does.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Testing

How has this been tested?
```

### Review Process

1. GitHub Actions will automatically run CI checks
2. A maintainer will review your code
3. Address any feedback or requested changes
4. Once approved, a maintainer will merge your PR

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use generics for reusable code
- Always type function parameters and return values

### Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting:

- Tab indentation (2 spaces rendered)
- Double quotes for strings
- Semicolons required
- No trailing commas in single-line arrays/objects

The linter will auto-fix most issues with `pnpm lint:fix`.

### Naming Conventions

- **Files**: kebab-case (`wizard-machine.ts`, `use-wizard.tsx`)
- **Types/Interfaces**: PascalCase (`WizardState`, `UseWizardReturn`)
- **Functions/Variables**: camelCase (`createWizard`, `currentStepId`)
- **Constants**: UPPER_SNAKE_CASE (rare, only for true constants)

### Architecture Principles

1. **Framework Agnostic Core**: Keep `@gooonzick/wizard-core` free of framework dependencies
2. **Type Safety**: Use TypeScript generics to ensure type safety
3. **Immutability**: Prefer immutable data structures
4. **Single Responsibility**: Each function/class should have one clear purpose
5. **Testability**: Write code that's easy to test

## Testing

### Test Structure

```typescript
import { describe, it, expect } from "vitest";

describe("WizardMachine", () => {
  describe("navigation", () => {
    it("should move to next step when validation passes", async () => {
      // Arrange
      const machine = new WizardMachine(/* ... */);

      // Act
      await machine.goNext();

      // Assert
      expect(machine.snapshot.currentStepId).toBe("next-step");
    });
  });
});
```

### Test Coverage

- Aim for >80% coverage on core logic
- Test edge cases and error conditions
- Use meaningful test descriptions

### Running Specific Tests

```bash
# Run specific test file
pnpm --filter=@gooonzick/wizard-core test wizard-machine.test.ts

# Run tests matching pattern
pnpm --filter=@gooonzick/wizard-core test -t "navigation"
```

## Documentation

### Code Comments

- Document complex logic
- Explain "why" not "what"
- Use JSDoc for public APIs:

````typescript
/**
 * Creates a new wizard with the given configuration.
 *
 * @param id - Unique identifier for the wizard
 * @returns A wizard builder instance
 * @example
 * ```typescript
 * const wizard = createWizard("signup")
 *   .step("email", (s) => s.next("password"))
 *   .build();
 * ```
 */
export function createWizard<T>(id: string): WizardBuilder<T> {
  return new WizardBuilder(id);
}
````

### Updating Documentation

When changing public APIs:

1. Update inline JSDoc comments
2. Update relevant markdown files in `docs/`
3. Update package README.md
4. Update examples if applicable

### Documentation Standards

- Use clear, concise language
- Provide code examples
- Explain use cases and trade-offs
- Keep examples up-to-date with API changes

## Release Process

Releases are managed by maintainers:

1. Update version in package.json files
2. Update CHANGELOG.md
3. Create git tag
4. Push tag to trigger publish workflow
5. GitHub Release created automatically

## Getting Help

- 💬 **Questions**: Open a [GitHub Discussion](https://github.com/YOUR_USERNAME/wizard-vite/discussions)
- 🐛 **Bugs**: Open a [GitHub Issue](https://github.com/YOUR_USERNAME/wizard-vite/issues)
- 📖 **Documentation**: Check [docs/](./docs/)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
