---
name: wizard-library
description: Build, debug, and modify applications and library code that use the Wizard ecosystem (core state machine, React/Vue integrations, transitions, validators, and tests). Use when an agent is asked to implement wizard features, fix navigation/validation behavior, add events or transition types, update React/Vue usage, or write/repair wizard examples and docs.
---

# Wizard Library Skill

Use this skill to execute Wizard tasks with high correctness and minimal regressions in any project.

## Follow This Workflow

1. Read the relevant reference file in `references/` from this skill.
2. Implement the smallest change that solves the user request.
3. Keep `WizardMachine` as the single source of truth for navigation/validation.
4. Run focused tests first, then run the project's typecheck and lint commands.

## Use Correctly By Area

### Core (`@gooonzick/wizard-core`)

- Change behavior through the core public APIs and machine flow.
- Keep transition logic centralized in `resolveTransition()` semantics.
- Keep guard functions pure (boolean result, no side effects).
- Build validators via composition (`combineValidators`, `requiredFields`, custom validator).

### React (`@gooonzick/wizard-react`)

- Keep `useWizard` API shape stable unless request explicitly requires breaking changes.
- Preserve loading-state handling (`isValidating`, `isSubmitting`, `isNavigating`).

### Vue (`@gooonzick/wizard-vue`)

- Preserve composable return structure parity with React slices (`state`, `validation`, `navigation`, `loading`, `actions`).
- Keep machine-driven state updates and avoid introducing duplicate state authority.

## Non-Negotiable Constraints

- Use TypeScript generics with `T extends WizardData`.
- Do not bypass machine methods with direct state mutation in adapters.
- Prefer public exports and documented APIs over internal module paths.

## Testing Rules

- Prefer event-based assertions in core tests; avoid asserting private internals.
- Start with targeted test files, then run broader package tests.
- Before finishing, run the project's typecheck and lint/fix commands.

## Read These References On Demand

- API and patterns: `references/api_reference.md`
- Architecture and change-safety rules: `references/architecture_and_changes.md`

Load only the reference(s) needed for the current task.
