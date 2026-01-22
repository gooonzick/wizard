# AGENTS.md

This file provides context and instructions for AI agents working in the WizardForm repository.
It combines build/test commands, code style guidelines, and architectural rules.

## 1. Environment & Build System

**Monorepo Structure:**
- `packages/core`: Framework-agnostic state machine (pure TS)
- `packages/react`: React hooks and integration
- `packages/docs`: VitePress documentation site
- `examples/`: Example applications

**Package Manager:** `pnpm` (managed via Turbo)

**Core Commands:**
- **Build All:** `pnpm build`
- **Test All:** `pnpm test`
- **Lint Check:** `pnpm lint` (Biome)
- **Lint Fix:** `pnpm lint:fix`
- **Type Check:** `pnpm typecheck`
- **Docs Dev:** `pnpm docs:dev` (or `turbo run dev --filter=@gooonzick/wizard-docs`)
- **Docs Build:** `pnpm docs:build`

**Running Specific Tests:**
To run a single test file, use `vitest` directly or filter via pnpm:
- **Via Turbo:** `pnpm turbo run test --filter=@gooonzick/wizard-core -- <test-file-pattern>`

**Note:** Always run `pnpm lint:fix` and `pnpm typecheck` before finishing a task to ensure compliance.

## 2. Code Style & Conventions

**Formatting (Biome):**
- **Indentation:** Tabs (not spaces)
- **Quotes:** Double quotes
- **Semicolons:** Always
- **Imports:** Organized automatically by Biome.
- **Configuration:** See `biome.json` in root.

**TypeScript:**
- **Strict Mode:** Enabled.
- **Generics:** Extensive use of `T` extending `Record<string, unknown>` for wizard data.
- **Exports:** Keep public API surface in `index.ts` clean and minimal.

**Naming:**
- **Files:** Kebab-case (e.g., `wizard-machine.ts`, `use-wizard.tsx`).
- **Classes/Interfaces:** PascalCase (e.g., `WizardMachine`, `WizardContext`).
- **Functions/Variables:** CamelCase (e.g., `createStep`, `resolveTransition`).
- **Private Members:** No prefix, but internal methods accessed by hooks should be treated with care.

**Error Handling:**
- Propagate errors cleanly; do not swallow them without logging.
- Use `Result` patterns or specific error classes where appropriate in Core.
- Async resolvers should handle failures gracefully.

## 3. Architecture & Patterns (Critical)

**WizardMachine (`packages/core/src/machine/wizard-machine.ts`):**
- **Single Source of Truth:** All state changes (navigation, validation, updates) MUST go through this class.
- **Private Access:** React hooks access private methods via bracket notation (e.g., `machine["resolveNextStep"]()`).
  - **Rule:** Do not rename these private methods without updating `packages/react/src/use-wizard.tsx`.

**Transitions:**
1. **Static:** `{ type: 'static', to: 'stepId' }`
2. **Conditional:** `{ type: 'conditional', branches: [...] }`
3. **Resolver:** `{ type: 'resolver', resolve: async (data, ctx) => stepId }`
- **Helper:** Use `resolveTransition()` from `transitions.ts`.

**Validators:**
- Located in `packages/core/src/machine/validators.ts`.
- Prefer composition: `combineValidators(requiredFields(...), customValidator)`.

**React Integration:**
- `useWizard` wraps the machine.
- For granular updates (performance), use `useWizardData`, `useWizardNavigation`, etc.

## 4. Testing Guidelines

**Framework:** Vitest
**Location:** `packages/*/tests/`

**Best Practices:**
- **Spy on Events:** Do not inspect internal private state of `WizardMachine`.
  - *Bad:* `expect(machine.currentStep).toBe('next')`
  - *Good:* `expect(events.onStepEnter).toHaveBeenCalledWith('next', ...)`
- **Integration:** React tests use `jsdom` and `@testing-library/react`.
- **Core:** Core tests run in Node environment.

## 5. Copilot/Cursor Rules (Imported)

*From `.github/copilot-instructions.md`*

### Core Concepts
- **Type Constraint:** All wizard data **must** extend `Record<string, unknown>`.
- **Guards:** Must return booleans with no side effects. Use combinators (`andGuards`, `orGuards`).

### Adding Features
1. **New Events:**
   - Add to `WizardEvents<T>` in `wizard-machine.ts`
   - Wire through `useWizard` in `use-wizard.tsx`
2. **New Transition Types:**
   - Update `StepTransition<T>` union
   - Update `resolveTransition()` logic

### Key Files
- `packages/core/src/index.ts`: Core public API.
- `packages/react/src/wizard-provider.tsx`: Context for granular hooks.
- `packages/core/src/examples/`: Reference patterns.

## 6. Workflow Checklist for Agents

1.  **Analyze:** Read related files and existing tests first.
2.  **Plan:** Propose changes ensuring `WizardMachine` remains the source of truth.
3.  **Implement:** Write code using Tabs and Double Quotes (Biome style).
4.  **Verify:**
    - Run relevant tests: `npx vitest run <test-file>`
    - Run type check: `pnpm typecheck`
    - Run lint fix: `pnpm lint:fix`
5.  **Refine:** Ensure no private method renames broke React hooks.
