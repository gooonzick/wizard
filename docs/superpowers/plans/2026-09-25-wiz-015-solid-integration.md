# WIZ-015 Solid.js Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@gooonzick/wizard-solid` — a Solid.js 1.x binding for the wizard state machine with `createWizard()`, context helpers, `field(key)`, an example app and docs.

**Architecture:** `createWizard()` builds a `WizardMachine` + `WizardStateManager` exactly like the Svelte runes binding, mirrors the manager's four cached channel snapshots into four Solid signals, and refreshes them from a single `"all"` subscription inside `batch()` (atomic) wrapped in `try/catch` (a throwing user effect goes to `onError` instead of into the machine). The returned object exposes reactive getters over those signals, so JSX/effects track per channel.

**Tech Stack:** TypeScript 6, Solid 1.9 (`solid-js`), Vite 8 library mode + `vite-plugin-dts`, Vitest 4 + jsdom + `vite-plugin-solid` + `@solidjs/testing-library`, Biome 2.5, pnpm + Turbo, Changesets.

**Spec:** `docs/superpowers/specs/2026-09-25-wiz-015-solid-integration-design.md` — read it first.

**Branch:** `feat/wiz-015-solid-integration` (already exists, spec already committed). Work from the repo root `/Users/gooonzick/Development/wizard-package/wizard-vite`.

---

## Ground rules (read before Task 1)

- **Style (Biome):** tabs, double quotes, semicolons. Run `pnpm lint:fix` before each commit that touches code.
- **Reference implementation:** `packages/svelte/src/runes/create-wizard.svelte.ts` and `packages/svelte/src/runes/types.ts`. When in doubt, match their behaviour.
- **Tests go through the public `Wizard` API and callbacks only** (AGENTS.md §4). `wizard.getManager()` is public and may be used to drive a channel directly.
- **Do NOT set `resolve.conditions` in any Vitest/Vite config.** `vite-plugin-solid` already selects Solid's browser/dev build in test mode.
- **Tracking granularity is per channel, not per field.** Any data change re-runs effects reading any `state` or `navigation` field. Never write a test asserting otherwise.
- **Do NOT touch `packages/core` or `packages/state`.** If a test shows a core/state bug (see Task 5 re-entrancy test), stop and report it instead of patching.
- **Test command for this package:** `pnpm --filter @gooonzick/wizard-solid exec vitest run <file>` (fast, single file). Whole package: `pnpm turbo run test --filter=@gooonzick/wizard-solid`.
- Commit messages follow Conventional Commits with scope `solid` (see `CONTRIBUTING.md`).

## File map

**New package `packages/solid/`**

| File | Responsibility |
| --- | --- |
| `package.json` | Package manifest (peer `solid-js ^1.8.0`) |
| `vite.config.ts` | Library build (plain TS, no Solid plugin) |
| `vitest.config.ts` | Test config (`vite-plugin-solid`, jsdom, source aliases) |
| `tsconfig.json` / `tsconfig.build.json` | Typecheck (src + tests, JSX) / declaration build (src) |
| `biome.json` | Extends root config |
| `README.md` | npm README |
| `src/types.ts` | `CreateWizardOptions`, `Wizard<T>`, slice types, `WizardField` |
| `src/create-wizard.ts` | Machine → manager → signals wiring, actions, `field()`, lifecycle |
| `src/context.ts` | `WizardProvider`, `useWizardContext`, `hasWizardContext` |
| `src/index.ts` | Public exports |
| `tests/helpers/wizard.ts`, `tests/helpers/flush.ts` | Shared fixture + microtask flush |
| `tests/environment.test.ts` | Proves the client build of Solid is used |
| `tests/create-wizard.test.ts` | Basic wiring, navigation, callbacks |
| `tests/reactivity.test.ts` | Signal tracking, batch atomicity, re-entrancy |
| `tests/actions.test.ts` | Every action + loading flags |
| `tests/field.test.ts` | `field(key)` |
| `tests/errors.test.tsx` | Listener isolation, `ErrorBoundary` |
| `tests/teardown.test.ts` | `autoDestroy`, `destroy()` |
| `tests/plugins.test.ts` | Plugin option |
| `tests/context.test.tsx` | Provider + hooks |
| `tests/components/wizard.test.tsx` | Real rendered component |
| `tests/types.test.ts` | Compile-time API assertions |

**New example `examples/solid-examples/`**: `package.json`, `vite.config.ts`, `tsconfig.json`, `biome.json`, `index.html`, `README.md`, `src/main.tsx`, `src/App.tsx`, `src/BasicExample.tsx`, `src/ContextExample.tsx`, `src/ContextChild.tsx`, `src/app.css`, `src/wizard/{definition,initial-data,types}.ts`.

**New docs:** `docs/solid-integration.md`, `docs/api/solid.md`, `packages/docs/guide/solid-integration.md`, `packages/docs/guide/api/solid.md`, `.changeset/wiz-015-solid-integration.md`.

**Modified:** `.changeset/config.json`, `knip.json`, `.syncpackrc`, `.github/labeler.yml`, `.github/workflows/pr-checks.yml`, `.github/workflows/publish.yml`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `docs/README.md`, `docs/api-reference.md`, `docs/getting-started.md`, `docs/ci-cd.md`, `packages/docs/guide/getting-started.md`, `packages/docs/guide/ci-cd.md`, `packages/docs/index.md`, `packages/docs/.vitepress/config.ts`, `.agents/skills/wizard-library/references/api_reference.md`, `.agents/skills/wizard-library/references/architecture_and_changes.md`, `docs/ROADMAP.md` (Task 14, conditional).

---

### Task 1: Scaffold the package and prove the toolchain

**Files:**
- Create: `packages/solid/package.json`, `packages/solid/vite.config.ts`, `packages/solid/vitest.config.ts`, `packages/solid/tsconfig.json`, `packages/solid/tsconfig.build.json`, `packages/solid/biome.json`, `packages/solid/src/index.ts`
- Test: `packages/solid/tests/environment.test.ts`

- [ ] **Step 1: Create `packages/solid/package.json`**

```json
{
	"name": "@gooonzick/wizard-solid",
	"version": "1.9.0",
	"description": "Solid.js integration for the WizardForm framework",
	"type": "module",
	"sideEffects": false,
	"main": "./dist/index.js",
	"module": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js"
		},
		"./package.json": "./package.json"
	},
	"files": [
		"dist",
		"README.md"
	],
	"scripts": {
		"build": "vite build",
		"typecheck": "tsc --build --verbose",
		"test": "vitest --run",
		"test:watch": "vitest --watch",
		"lint": "biome check .",
		"lint:fix": "biome check . --write"
	},
	"peerDependencies": {
		"solid-js": "^1.8.0"
	},
	"dependencies": {
		"@gooonzick/wizard-core": "workspace:*",
		"@gooonzick/wizard-state": "workspace:*"
	},
	"devDependencies": {
		"@biomejs/biome": "^2.5.3",
		"@solidjs/testing-library": "^0.8.10",
		"@types/node": "^26.1.1",
		"@vitest/coverage-v8": "^4.1.10",
		"jsdom": "^29.1.1",
		"solid-js": "^1.9.15",
		"typescript": "^6.0.3",
		"vite": "^8.1.4",
		"vite-plugin-dts": "^5.0.3",
		"vite-plugin-solid": "^2.11.14",
		"vitest": "^4.1.10"
	},
	"repository": {
		"type": "git",
		"url": "https://github.com/gooonzick/wizard",
		"directory": "packages/solid"
	},
	"publishConfig": {
		"access": "public"
	},
	"keywords": [
		"wizard",
		"solid",
		"solid-js",
		"signals",
		"form",
		"multi-step"
	]
}
```

- [ ] **Step 2: Create `packages/solid/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
	// NOTE: `vite-plugin-solid` is deliberately NOT used here. `src/` contains no
	// JSX (WizardProvider is built with `createComponent`), so the library is plain
	// TypeScript and needs no `"solid"` export condition.
	plugins: [
		dts({
			include: ["src"],
			exclude: ["tests"],
			tsconfigPath: "./tsconfig.build.json",
		}),
	],
	build: {
		lib: {
			entry: "./src/index.ts",
			formats: ["es"],
			fileName: "index",
		},
		outDir: "./dist",
		emptyOutDir: true,
		rollupOptions: {
			external: [
				"solid-js",
				"solid-js/web",
				"@gooonzick/wizard-core",
				"@gooonzick/wizard-state",
			],
		},
	},
});
```

- [ ] **Step 3: Create `packages/solid/vitest.config.ts`**

```ts
import { resolve } from "node:path";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
	// `vite-plugin-solid` compiles the `.tsx` tests and, in test mode, already
	// selects Solid's browser + development build. Do NOT add `resolve.conditions`:
	// an explicit list would REPLACE Vite's default client conditions.
	plugins: [solid()],
	resolve: {
		alias: {
			// MANDATORY: run tests against core/state TypeScript SOURCES, not dist
			// (same as packages/react, packages/vue and packages/svelte).
			"@gooonzick/wizard-core": resolve(__dirname, "../core/src/index.ts"),
			"@gooonzick/wizard-state": resolve(__dirname, "../state/src/index.ts"),
		},
	},
	test: {
		environment: "jsdom",
		include: ["tests/**/*.test.{ts,tsx}"],
		globals: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: ["src/types.ts"],
			thresholds: {
				statements: 70,
				branches: 60,
				functions: 60,
				lines: 70,
			},
		},
	},
});
```

- [ ] **Step 4: Create `packages/solid/tsconfig.build.json`**

```json
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"rootDir": "./src",
		"outDir": "./dist",
		"emitDeclarationOnly": true,
		"declarationMap": false
	},
	"include": ["src/**/*"],
	"references": [{ "path": "../core/tsconfig.build.json" }]
}
```

- [ ] **Step 5: Create `packages/solid/tsconfig.json`**

```json
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"outDir": "./.tsbuild",
		"emitDeclarationOnly": true,
		"jsx": "preserve",
		"jsxImportSource": "solid-js",
		"types": ["node"]
	},
	"include": ["src/**/*", "tests/**/*"],
	"references": [{ "path": "./tsconfig.build.json" }]
}
```

- [ ] **Step 6: Create `packages/solid/biome.json`**

```json
{
	"$schema": "https://biomejs.dev/schemas/2.5.3/schema.json",
	"extends": "//"
}
```

- [ ] **Step 7: Create placeholder `packages/solid/src/index.ts`**

```ts
// Public API is added in Task 9.
export {};
```

- [ ] **Step 8: Write the environment test `packages/solid/tests/environment.test.ts`**

```ts
import { createComputed, createRoot, createSignal } from "solid-js";
import { isServer } from "solid-js/web";
import { describe, expect, it } from "vitest";

/**
 * Guards the toolchain: if Vitest ever resolves Solid's SERVER build, signals
 * stop being reactive and every other test in this package becomes meaningless.
 */
describe("test environment", () => {
	it("E1: uses Solid's client build", () => {
		expect(isServer).toBe(false);
	});

	it("E2: signals are reactive", () => {
		const seen: number[] = [];
		const [count, setCount] = createSignal(0);
		const dispose = createRoot((d) => {
			// createComputed runs synchronously on creation and on every change.
			createComputed(() => {
				seen.push(count());
			});
			return d;
		});

		setCount(1);
		dispose();
		setCount(2);

		expect(seen).toEqual([0, 1]);
	});
});
```

- [ ] **Step 9: Install dependencies**

Run: `pnpm install`
Expected: completes, `pnpm-lock.yaml` updated with `solid-js`, `vite-plugin-solid`, `@solidjs/testing-library` under `packages/solid`. A peer warning about `@solidjs/router` must NOT appear (it is an optional peer).

- [ ] **Step 10: Run the environment test**

Run: `pnpm --filter @gooonzick/wizard-solid exec vitest run tests/environment.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 11: Build and typecheck the empty package**

Run: `pnpm turbo run build typecheck --filter=@gooonzick/wizard-solid`
Expected: both succeed; `packages/solid/dist/index.js` and `dist/index.d.ts` exist.

- [ ] **Step 12: Lint and commit**

```bash
pnpm --filter @gooonzick/wizard-solid lint:fix
git add packages/solid pnpm-lock.yaml
git commit -m "chore(solid): scaffold @gooonzick/wizard-solid package"
```

---

### Task 2: Monorepo wiring

**Files:**
- Modify: `.changeset/config.json`, `knip.json`, `.syncpackrc`, `.github/labeler.yml`, `.github/workflows/pr-checks.yml`, `.github/workflows/publish.yml`

- [ ] **Step 1: Add the package to the fixed release group in `.changeset/config.json`**

Replace the `"fixed"` array with:

```json
    "fixed": [
        [
            "@gooonzick/wizard-core",
            "@gooonzick/wizard-react",
            "@gooonzick/wizard-vue",
            "@gooonzick/wizard-state",
            "@gooonzick/wizard-svelte",
            "@gooonzick/wizard-solid"
        ]
    ],
```

- [ ] **Step 2: Add workspaces to `knip.json`**

Insert after the `"packages/svelte"` entry:

```json
		"packages/solid": {
			"entry": ["src/index.ts!"],
			"project": ["src/**/*.ts", "tests/**/*.{ts,tsx}"]
		},
```

and after the `"examples/react-examples"` entry (add a comma to the preceding `}`):

```json
		"examples/solid-examples": {
			"entry": ["src/main.tsx"],
			"project": ["src/**/*.{ts,tsx}"]
		}
```

(The example is created in Task 11. Until then knip only prints a "Remove from workspaces" hint for the missing folder and exits 0 — ignore it in Task 10.)

- [ ] **Step 3: Add a syncpack rule to `.syncpackrc`**

Insert as the second element of `"versionGroups"` (right after the Svelte rule):

```json
        {
            "label": "@gooonzick/wizard-solid supports Solid 1.8+, so its peer range is deliberately wider than the Solid 1.9 dev dependency CI builds against.",
            "packages": [
                "@gooonzick/wizard-solid"
            ],
            "dependencies": [
                "solid-js"
            ],
            "dependencyTypes": [
                "peer"
            ],
            "isIgnored": true
        },
```

- [ ] **Step 4: Add a label in `.github/labeler.yml`** (after the `'package: svelte'` block)

```yaml
'package: solid':
  - changed-files:
    - any-glob-to-any-file: 'packages/solid/**/*'
```

- [ ] **Step 5: Add `solid` to the bundle-size loop in `.github/workflows/pr-checks.yml`**

Change `for pkg in core react vue svelte; do` to `for pkg in core react vue svelte solid; do`.

- [ ] **Step 6: Update `.github/workflows/publish.yml`**

1. Description: `"Package to publish (core, react, vue, svelte, solid, state, or all)"`.
2. Add `- solid` to `options:` right after `- svelte`.
3. Change `echo "packages=core react vue state svelte" >> $GITHUB_OUTPUT` to `echo "packages=core react vue state svelte solid" >> $GITHUB_OUTPUT`.
4. Insert after the `Publish @gooonzick/wizard-svelte` step:

```yaml
      - name: Publish @gooonzick/wizard-solid
        if: contains(steps.packages.outputs.packages, 'solid')
        working-directory: ./packages/solid
        run: |
          pnpm publish --access public --tag ${{ steps.packages.outputs.tag }} --no-git-checks --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 7: Verify syncpack**

Run: `pnpm syncpack:lint`
Expected: no mismatch reported for `solid-js`.

- [ ] **Step 8: Commit**

```bash
git add .changeset/config.json knip.json .syncpackrc .github/labeler.yml .github/workflows/pr-checks.yml .github/workflows/publish.yml
git commit -m "chore(ci): wire @gooonzick/wizard-solid into release, CI and tooling"
```

---

### Task 3: Types and test helpers

**Files:**
- Create: `packages/solid/src/types.ts`, `packages/solid/tests/helpers/wizard.ts`, `packages/solid/tests/helpers/flush.ts`

- [ ] **Step 1: Create `packages/solid/src/types.ts`**

```ts
import type {
	GoToOptions,
	StepId,
	StepStatus,
	ValidationSummary,
	WizardContext,
	WizardData,
	WizardDefinition,
	WizardMachine,
	WizardPlugin,
	WizardProgress,
	WizardSerializedState,
	WizardState,
	WizardStepDefinition,
} from "@gooonzick/wizard-core";
import type { WizardStateManager } from "@gooonzick/wizard-state";

/**
 * Options accepted by `createWizard()`.
 */
export interface CreateWizardOptions<T extends WizardData> {
	/** Read ONCE at creation — NOT reactive. Recreate the wizard to reconfigure. */
	definition: WizardDefinition<T>;
	/** Read ONCE at creation — NOT reactive. */
	initialData: T;
	/** Read ONCE at creation — NOT reactive. Defaults to `{}`. */
	context?: WizardContext;

	onStateChange?: (state: WizardState<T>) => void;
	onStepEnter?: (stepId: StepId, data: T) => void;
	onStepLeave?: (stepId: StepId, data: T) => void;
	onComplete?: (data: T) => void;
	onCancel?: (data: T) => void | Promise<void>;
	onReset?: () => void;
	/**
	 * Receives machine errors AND errors thrown by Solid effects while the wizard
	 * pushes new state into its signals (when no `<ErrorBoundary>` catches them).
	 */
	onError?: (error: Error) => void;
	onDataChange?: (prevData: T, nextData: T, changedFields: (keyof T)[]) => void;

	/**
	 * Plugins registered once at machine creation (read once, NOT reactive).
	 * `onInit` is dispatched fire-and-forget and may run concurrently with the
	 * initial step's `onEnter`.
	 */
	plugins?: WizardPlugin<T>[];

	/**
	 * When true (default) and `createWizard()` runs under a Solid owner (a
	 * component or `createRoot`), the wizard registers
	 * `onCleanup(() => void wizard.destroy())`. Without an owner nothing is
	 * registered and you own `destroy()` yourself.
	 */
	autoDestroy?: boolean;
}

/**
 * State slice - current step and data
 */
export interface WizardStoreState<T extends WizardData> {
	currentStepId: StepId;
	currentStep: WizardStepDefinition<T>;
	data: T;
	isCompleted: boolean;
	stepStatuses: Record<StepId, StepStatus>;
	progress: WizardProgress;
}

/**
 * Validation slice - validation state and errors
 */
export interface WizardStoreValidation {
	isValid: boolean;
	validationErrors?: Record<string, string>;
}

/**
 * Navigation slice - step navigation capabilities
 */
export interface WizardStoreNavigation {
	canGoNext: boolean;
	canGoPrevious: boolean;
	canGoBack: boolean;
	isFirstStep: boolean;
	isLastStep: boolean;
	visitedSteps: StepId[];
	availableSteps: StepId[];
	stepHistory: StepId[];
}

/**
 * Loading slice - async operation states
 */
export interface WizardStoreLoading {
	isValidating: boolean;
	isSubmitting: boolean;
	isNavigating: boolean;
}

/**
 * Actions slice - data mutations and validation
 */
export interface WizardStoreActions<T extends WizardData> {
	updateData: (updater: (data: T) => T) => void;
	setData: (data: T) => void;
	updateField: <K extends keyof T>(field: K, value: T[K]) => void;
	validate: () => Promise<void>;
	validateAll: (options?: {
		updateStatuses?: boolean;
	}) => Promise<ValidationSummary>;
	canSubmit: () => Promise<boolean>;
	submit: () => Promise<void>;
	/** Fire-and-forget; failures are reported through `onError`. */
	reset: (data?: T) => void;
	cancel: () => Promise<void>;
	serialize: () => WizardSerializedState<T>;
	/** Fire-and-forget; failures (e.g. `WizardRestoreError`) go to `onError`. */
	restore: (state: WizardSerializedState<T>) => void;
}

/**
 * A two-way binding target for one top-level data field.
 * `<input value={f.value} onInput={(e) => (f.value = e.currentTarget.value)} />`
 */
export interface WizardField<V> {
	get value(): V;
	set value(v: V);
}

/**
 * The signal-backed wizard returned by `createWizard()`.
 *
 * Every property below is a reactive getter: read it inside JSX, `createEffect`
 * or `createMemo` to track it. Destructuring (`const { canGoNext } = wizard`)
 * reads once and loses reactivity, exactly like Solid props.
 */
export interface Wizard<T extends WizardData> {
	// ---- flat reactive getters ----
	readonly currentStepId: StepId;
	readonly currentStep: WizardStepDefinition<T>;
	readonly data: T;
	readonly isCompleted: boolean;
	readonly stepStatuses: Record<StepId, StepStatus>;
	readonly progress: WizardProgress;
	readonly isValid: boolean;
	readonly validationErrors: Record<string, string> | undefined;
	readonly canGoNext: boolean;
	readonly canGoPrevious: boolean;
	readonly canGoBack: boolean;
	readonly isFirstStep: boolean;
	readonly isLastStep: boolean;
	readonly visitedSteps: StepId[];
	readonly availableSteps: StepId[];
	readonly stepHistory: StepId[];
	readonly isValidating: boolean;
	readonly isSubmitting: boolean;
	readonly isNavigating: boolean;

	// ---- slice getters ----
	readonly state: WizardStoreState<T>;
	readonly validation: WizardStoreValidation;
	readonly navigation: WizardStoreNavigation;
	readonly loading: WizardStoreLoading;

	readonly actions: WizardStoreActions<T>;

	goNext(): Promise<void>;
	goPrevious(): Promise<void>;
	/** @deprecated Use `goPrevious()`. */
	goBack(steps?: number): Promise<void>;
	goTo(stepId: StepId, options?: GoToOptions): Promise<void>;
	/** @deprecated Use `goTo(stepId)`. */
	goToStep(stepId: StepId): Promise<void>;

	/** Stable reference per key; reads are reactive, writes go through `machine.updateField`. */
	field<K extends keyof T>(key: K): WizardField<T[K]>;

	getMachine(): WizardMachine<T>;
	getManager(): WizardStateManager<T>;
	destroy(): Promise<void>;
	readonly isDestroyed: boolean;
}
```

- [ ] **Step 2: Create `packages/solid/tests/helpers/wizard.ts`**

```ts
import type { WizardDefinition } from "@gooonzick/wizard-core";
import { createLinearWizard } from "@gooonzick/wizard-core";

/**
 * Shared 3-step fixture data type.
 *
 * Declared as a type alias (not an interface) on purpose: TypeScript only grants
 * an implicit index signature to type aliases, so this satisfies `WizardData`
 * while keeping `keyof SignupData` narrow — which is what tests/types.test.ts
 * asserts on.
 */
export type SignupData = {
	name: string;
	email: string;
	plan: string;
};

export const initialData: SignupData = { name: "", email: "", plan: "" };

/**
 * A 3-step linear wizard (`personal -> plan -> summary`) whose first step is
 * invalid while `name` is empty.
 */
export function createTestDefinition(): WizardDefinition<SignupData> {
	return createLinearWizard<SignupData>({
		id: "signup",
		steps: [
			{
				id: "personal",
				title: "Personal",
				validate: async (data) =>
					data.name.trim().length > 0
						? { valid: true }
						: { valid: false, errors: { name: "Name is required" } },
			},
			{ id: "plan", title: "Plan" },
			{ id: "summary", title: "Summary" },
		],
	});
}
```

- [ ] **Step 3: Create `packages/solid/tests/helpers/flush.ts`**

```ts
export const flush = () => new Promise((r) => setTimeout(r, 0));
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @gooonzick/wizard-solid typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --filter @gooonzick/wizard-solid lint:fix
git add packages/solid/src/types.ts packages/solid/tests/helpers
git commit -m "feat(solid): add public types and test fixtures"
```

---

### Task 4: `createWizard()` — core wiring

**Files:**
- Create: `packages/solid/src/create-wizard.ts`
- Test: `packages/solid/tests/create-wizard.test.ts`

- [ ] **Step 1: Write the failing test `packages/solid/tests/create-wizard.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import type { CreateWizardOptions } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard(
	options: Partial<CreateWizardOptions<SignupData>> = {},
) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...options,
	});
}

const FLAT_KEYS = [
	"currentStepId",
	"currentStep",
	"data",
	"isCompleted",
	"stepStatuses",
	"progress",
	"isValid",
	"validationErrors",
	"canGoNext",
	"canGoPrevious",
	"canGoBack",
	"isFirstStep",
	"isLastStep",
	"visitedSteps",
	"availableSteps",
	"stepHistory",
	"isValidating",
	"isSubmitting",
	"isNavigating",
] as const;

describe("createWizard", () => {
	it("C1: exposes the initial state", async () => {
		const wizard = makeWizard();
		await flush();

		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.data).toEqual(initialData);
		expect(wizard.isFirstStep).toBe(true);
		expect(wizard.isCompleted).toBe(false);
		expect(wizard.isNavigating).toBe(false);
		expect(wizard.isDestroyed).toBe(false);
	});

	it("C2: canGoNext is false initially and true after the async navigation compute", async () => {
		const wizard = makeWizard();

		expect(wizard.canGoNext).toBe(false);
		await flush();
		expect(wizard.canGoNext).toBe(true);
	});

	it("C3: slice getters return the manager's cached snapshots", async () => {
		const wizard = makeWizard();
		await flush();
		const manager = wizard.getManager();

		expect(wizard.state).toBe(manager.getStateSnapshot());
		expect(wizard.validation).toBe(manager.getValidationSnapshot());
		expect(wizard.navigation).toBe(manager.getNavigationSnapshot());
		expect(wizard.loading).toBe(manager.getLoadingSnapshot());
	});

	it("C4: every flat getter equals the matching slice field", async () => {
		const wizard = makeWizard();
		await flush();
		const merged: Record<string, unknown> = {
			...wizard.state,
			...wizard.validation,
			...wizard.navigation,
			...wizard.loading,
		};

		for (const key of FLAT_KEYS) {
			expect(key in wizard).toBe(true);
			expect(wizard[key]).toBe(merged[key]);
		}
	});

	it("C5: goNext / goPrevious / goTo move the current step", async () => {
		const wizard = makeWizard();
		await flush();
		wizard.actions.updateField("name", "ada");

		await wizard.goNext();
		expect(wizard.currentStepId).toBe("plan");
		expect(wizard.stepHistory).toEqual(["personal", "plan"]);

		await wizard.goPrevious();
		expect(wizard.currentStepId).toBe("personal");

		await wizard.goTo("summary");
		expect(wizard.currentStepId).toBe("summary");
		expect(wizard.isLastStep).toBe(true);
	});

	it("C6: an invalid step blocks goNext and exposes validationErrors", async () => {
		const onError = vi.fn();
		const wizard = makeWizard({ onError });
		await flush();

		await expect(wizard.goNext()).rejects.toThrow();

		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.isValid).toBe(false);
		expect(wizard.validationErrors?.name).toBe("Name is required");
		expect(onError).toHaveBeenCalled();
	});

	it("C7: isNavigating is true while a transition is in flight", async () => {
		const wizard = makeWizard();
		await flush();
		wizard.actions.updateField("name", "ada");

		const pending = wizard.goNext();
		expect(wizard.isNavigating).toBe(true);
		await pending;
		expect(wizard.isNavigating).toBe(false);
	});

	it("C8: callbacks are forwarded", async () => {
		const onStateChange = vi.fn();
		const onStepEnter = vi.fn();
		const onStepLeave = vi.fn();
		const onComplete = vi.fn();
		const onDataChange = vi.fn();
		const wizard = makeWizard({
			onStateChange,
			onStepEnter,
			onStepLeave,
			onComplete,
			onDataChange,
		});
		await flush();
		expect(onStepEnter).toHaveBeenCalledWith("personal", expect.anything());

		wizard.actions.updateField("name", "ada");
		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onStateChange).toHaveBeenCalled();

		await wizard.goNext();
		expect(onStepLeave).toHaveBeenCalledWith("personal", expect.anything());
		expect(onStepEnter).toHaveBeenCalledWith("plan", expect.anything());

		await wizard.goNext();
		await wizard.actions.submit();
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(wizard.isCompleted).toBe(true);
	});

	it("C9: goToStep skips validation (deprecated alias)", async () => {
		const wizard = makeWizard();
		await flush();

		await wizard.goToStep("plan");
		expect(wizard.currentStepId).toBe("plan");
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gooonzick/wizard-solid exec vitest run tests/create-wizard.test.ts`
Expected: FAIL — `Failed to resolve import "../src/create-wizard"`.

- [ ] **Step 3: Implement `packages/solid/src/create-wizard.ts`**

This version deliberately has **no `batch()` and no `try/catch`** around the signal sync — Tasks 5 and 7 add them test-first.

```ts
import type {
	GoToOptions,
	StepId,
	WizardData,
	WizardSerializedState,
	WizardState,
} from "@gooonzick/wizard-core";
import { WizardMachine } from "@gooonzick/wizard-core";
import { WizardStateManager } from "@gooonzick/wizard-state";
import { createSignal, getOwner, onCleanup } from "solid-js";
import type {
	CreateWizardOptions,
	Wizard,
	WizardField,
	WizardStoreActions,
} from "./types";

/**
 * Creates a signal-backed wizard.
 *
 * The four manager channels (state / validation / navigation / loading) are
 * mirrored into four signals. The manager hands out frozen, cached snapshots and
 * keeps an unaffected channel's reference, so Solid's default `===` equality
 * skips signals whose channel did not change.
 */
export function createWizard<T extends WizardData>(
	options: CreateWizardOptions<T>,
): Wizard<T> {
	const {
		definition,
		initialData,
		context = {},
		plugins,
		autoDestroy = true,
		...callbacks
	} = options;

	// Forward references. The machine may fire onStateChange synchronously from its
	// constructor (initializeFirstStep) BEFORE these are assigned — hence the guard.
	let managerRef: WizardStateManager<T> | null = null;
	let previousState: WizardState<T> | null = null;

	const machine = new WizardMachine<T>(
		definition,
		context,
		initialData,
		{
			onStateChange: (newState: WizardState<T>) => {
				const oldState = previousState;
				previousState = newState;
				if (oldState && managerRef) {
					managerRef.handleStateChange(newState, oldState);
				}
				callbacks.onStateChange?.(newState);
			},
			onStepEnter: (stepId: StepId, data: T) =>
				callbacks.onStepEnter?.(stepId, data),
			onStepLeave: (stepId: StepId, data: T) =>
				callbacks.onStepLeave?.(stepId, data),
			onComplete: (data: T) => callbacks.onComplete?.(data),
			onCancel: async (data: T) => {
				await callbacks.onCancel?.(data);
			},
			onReset: () => callbacks.onReset?.(),
			onError: (error: Error) => callbacks.onError?.(error),
			onDataChange: (prev: T, next: T, changedFields: (keyof T)[]) =>
				callbacks.onDataChange?.(prev, next, changedFields),
		},
		plugins,
	);

	const manager = new WizardStateManager(machine, definition.initialStepId);
	managerRef = manager;
	previousState = machine.snapshot;

	const reportError = (error: unknown): void => {
		callbacks.onError?.(
			error instanceof Error ? error : new Error(String(error)),
		);
	};

	const [stateSnapshot, setStateSnapshot] = createSignal(
		manager.getStateSnapshot(),
	);
	const [validationSnapshot, setValidationSnapshot] = createSignal(
		manager.getValidationSnapshot(),
	);
	const [navigationSnapshot, setNavigationSnapshot] = createSignal(
		manager.getNavigationSnapshot(),
	);
	const [loadingSnapshot, setLoadingSnapshot] = createSignal(
		manager.getLoadingSnapshot(),
	);

	const syncSignals = (): void => {
		setStateSnapshot(manager.getStateSnapshot());
		setNavigationSnapshot(manager.getNavigationSnapshot());
		setValidationSnapshot(manager.getValidationSnapshot());
		setLoadingSnapshot(manager.getLoadingSnapshot());
	};

	// One "all" subscription: the manager refreshes every affected channel cache
	// BEFORE notifying, and "all" listeners fire on every notify (including the
	// async navigation recompute and loading changes). Released by destroy().
	manager.subscribe(syncSignals, "all");

	const withNavigating = async (fn: () => Promise<void>): Promise<void> => {
		manager.setLoadingState({ isNavigating: true });
		try {
			await fn();
		} finally {
			manager.setLoadingState({ isNavigating: false });
		}
	};

	const goNext = () => withNavigating(() => machine.goNext());
	const goPrevious = () => withNavigating(() => machine.goPrevious());
	const goBack = (steps = 1) => withNavigating(() => machine.goBack(steps));
	const goTo = (stepId: StepId, opts?: GoToOptions) =>
		withNavigating(() => machine.goTo(stepId, opts));
	const goToStep = (stepId: StepId) => goTo(stepId, { skipValidation: true });

	const actions: WizardStoreActions<T> = {
		updateData: (updater) => machine.updateData(updater),
		setData: (data) => machine.setData(data),
		// Direct call — preserves the Object.is no-op guard and changedFields=[field].
		updateField: (field, value) => machine.updateField(field, value),
		validate: async () => {
			manager.setLoadingState({ isValidating: true });
			try {
				await machine.validate();
			} finally {
				manager.setLoadingState({ isValidating: false });
			}
		},
		validateAll: async (opts) => {
			manager.setLoadingState({ isValidating: true });
			try {
				return await machine.validateAll(opts);
			} finally {
				manager.setLoadingState({ isValidating: false });
			}
		},
		canSubmit: () => machine.canSubmit(),
		submit: async () => {
			manager.setLoadingState({ isSubmitting: true });
			try {
				await machine.submit();
			} finally {
				manager.setLoadingState({ isSubmitting: false });
			}
		},
		// Fire-and-forget, but the machine's synchronous reset()/restore() can throw
		// (a malformed snapshot raises WizardRestoreError, which the machine does NOT
		// route through handleError). Terminating the chain here keeps it from
		// becoming an unhandled rejection and surfaces it on onError instead.
		reset: (data?: T) => {
			void manager.runReset(data ?? initialData).catch(reportError);
		},
		cancel: () => manager.runCancel(),
		serialize: () => machine.serialize(),
		restore: (serialized: WizardSerializedState<T>) => {
			void manager.runRestore(serialized).catch(reportError);
		},
	};

	const fields = new Map<keyof T, unknown>();
	const field = <K extends keyof T>(key: K): WizardField<T[K]> => {
		const cached = fields.get(key);
		if (cached) {
			return cached as WizardField<T[K]>;
		}
		const f: WizardField<T[K]> = {
			get value() {
				return stateSnapshot().data[key];
			},
			set value(v: T[K]) {
				machine.updateField(key, v);
			},
		};
		fields.set(key, f);
		return f;
	};

	let destroyed = false;
	const destroy = async (): Promise<void> => {
		if (destroyed) return;
		destroyed = true;
		await manager.destroy();
	};

	// Only register cleanup under an owner: outside one, Solid's onCleanup would
	// log a dev warning and never run. Without an owner the caller owns destroy().
	if (autoDestroy && getOwner()) {
		onCleanup(() => {
			void destroy();
		});
	}

	return {
		get currentStepId() {
			return stateSnapshot().currentStepId;
		},
		get currentStep() {
			return stateSnapshot().currentStep;
		},
		get data() {
			return stateSnapshot().data;
		},
		get isCompleted() {
			return stateSnapshot().isCompleted;
		},
		get stepStatuses() {
			return stateSnapshot().stepStatuses;
		},
		get progress() {
			return stateSnapshot().progress;
		},
		get isValid() {
			return validationSnapshot().isValid;
		},
		get validationErrors() {
			return validationSnapshot().validationErrors;
		},
		get canGoNext() {
			return navigationSnapshot().canGoNext;
		},
		get canGoPrevious() {
			return navigationSnapshot().canGoPrevious;
		},
		get canGoBack() {
			return navigationSnapshot().canGoBack;
		},
		get isFirstStep() {
			return navigationSnapshot().isFirstStep;
		},
		get isLastStep() {
			return navigationSnapshot().isLastStep;
		},
		get visitedSteps() {
			return navigationSnapshot().visitedSteps;
		},
		get availableSteps() {
			return navigationSnapshot().availableSteps;
		},
		get stepHistory() {
			return navigationSnapshot().stepHistory;
		},
		get isValidating() {
			return loadingSnapshot().isValidating;
		},
		get isSubmitting() {
			return loadingSnapshot().isSubmitting;
		},
		get isNavigating() {
			return loadingSnapshot().isNavigating;
		},
		get state() {
			return stateSnapshot();
		},
		get validation() {
			return validationSnapshot();
		},
		get navigation() {
			return navigationSnapshot();
		},
		get loading() {
			return loadingSnapshot();
		},
		actions,
		goNext,
		goPrevious,
		goBack,
		goTo,
		goToStep,
		field,
		getMachine: () => machine,
		getManager: () => manager,
		destroy,
		get isDestroyed() {
			return destroyed || manager.isDestroyed;
		},
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gooonzick/wizard-solid exec vitest run tests/create-wizard.test.ts`
Expected: PASS, 9 tests.

If C7 fails because `isNavigating` is already `false` synchronously after `goNext()` is called, check that `withNavigating` calls `setLoadingState` before the first `await` (it does in the code above) — do not change the test.

- [ ] **Step 5: Commit**

```bash
pnpm --filter @gooonzick/wizard-solid lint:fix
git add packages/solid/src/create-wizard.ts packages/solid/tests/create-wizard.test.ts
git commit -m "feat(solid): add signal-backed createWizard()"
```

---

### Task 5: Reactivity — batch atomicity (test-first)

**Files:**
- Test: `packages/solid/tests/reactivity.test.ts`
- Modify: `packages/solid/src/create-wizard.ts` (the `manager.subscribe(syncSignals, "all")` line and the `solid-js` import)

- [ ] **Step 1: Write the test `packages/solid/tests/reactivity.test.ts`**

```ts
import { createEffect, createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import type { CreateWizardOptions } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard(
	options: Partial<CreateWizardOptions<SignupData>> = {},
) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...options,
	});
}

const disposers: Array<() => void> = [];

/** Runs `fn` inside a tracked effect under a fresh root; disposed after each test. */
function track(fn: () => void): void {
	createRoot((dispose) => {
		disposers.push(dispose);
		createEffect(fn);
	});
}

afterEach(() => {
	for (const dispose of disposers.splice(0)) dispose();
});

describe("reactivity", () => {
	it("X1: an effect on canGoNext re-runs after the async navigation compute", async () => {
		const wizard = makeWizard();
		const seen: boolean[] = [];
		track(() => {
			seen.push(wizard.canGoNext);
		});

		await flush();

		expect(seen).toEqual([false, true]);
	});

	it("X2: an effect never observes a half-applied transition (batch atomicity)", async () => {
		const wizard = makeWizard();
		await flush();
		wizard.actions.updateField("name", "ada");

		const seen: Array<[string, boolean]> = [];
		track(() => {
			seen.push([wizard.currentStepId, wizard.isFirstStep]);
		});

		await wizard.goNext();
		await flush();

		// Without batch(), the state signal is written before the navigation signal
		// and the effect sees the new step with the OLD isFirstStep.
		expect(seen).not.toContainEqual(["plan", true]);
		expect(seen.at(-1)).toEqual(["plan", false]);
	});

	it("X3: a loading-only change does not re-run an effect reading currentStepId", async () => {
		const wizard = makeWizard();
		await flush();

		let runs = 0;
		track(() => {
			void wizard.currentStepId;
			runs++;
		});
		const before = runs;

		wizard.getManager().setLoadingState({ isSubmitting: true });
		wizard.getManager().setLoadingState({ isSubmitting: false });

		expect(runs).toBe(before);
		expect(wizard.isSubmitting).toBe(false);
	});

	it("X4: a no-op updateField re-runs nothing", async () => {
		const wizard = makeWizard();
		await flush();

		let runs = 0;
		track(() => {
			void wizard.data.name;
			void wizard.canGoNext;
			void wizard.isValid;
			runs++;
		});
		const before = runs;

		wizard.actions.updateField("name", "");
		await flush();

		expect(runs).toBe(before);
	});

	it("X5: a data change re-runs an effect reading data", async () => {
		const wizard = makeWizard();
		await flush();

		const names: string[] = [];
		track(() => {
			names.push(wizard.data.name);
		});

		wizard.actions.updateField("name", "ada");

		expect(names).toEqual(["", "ada"]);
	});

	it("X6: re-entrancy — an effect that writes data on step entry leaves a consistent state", async () => {
		const onError = vi.fn();
		const wizard = makeWizard({ onError });
		await flush();
		wizard.actions.updateField("name", "ada");

		track(() => {
			if (wizard.currentStepId === "plan" && wizard.data.plan === "") {
				wizard.actions.updateField("plan", "pro");
			}
		});

		await wizard.goNext();
		await flush();

		expect(onError).not.toHaveBeenCalled();
		expect(wizard.currentStepId).toBe("plan");
		expect(wizard.data.plan).toBe("pro");
		expect(wizard.data.name).toBe("ada");
		expect(wizard.getMachine().snapshot.data.plan).toBe("pro");
	});
});
```

- [ ] **Step 2: Run it — X2 must FAIL, the rest pass**

Run: `pnpm --filter @gooonzick/wizard-solid exec vitest run tests/reactivity.test.ts`
Expected: X2 FAILS (`seen` contains `["plan", true]`). X1, X3, X4, X5 PASS.

**X6 decision point:** X6 is expected to PASS (verified during plan review against solid-js 1.9.15: the effect's write happens inside `navigateToStep` and is kept). If it FAILS, the machine loses the effect's write when an effect re-enters mid-transition. That is a core bug, out of scope: **stop, do not change core**, mark X6 with `it.fails(...)` plus a comment `// Known core limitation: re-entrant write during a transition — see WIZ-015 plan Task 5`, and report it in the task summary so it can be filed as a separate issue. The docs (Task 12) then must say re-entrant writes from effects are not supported yet.

- [ ] **Step 3: Add `batch()` to the subscription**

In `packages/solid/src/create-wizard.ts` change the import to:

```ts
import { batch, createSignal, getOwner, onCleanup } from "solid-js";
```

and replace

```ts
	manager.subscribe(syncSignals, "all");
```

with

```ts
	manager.subscribe(() => {
		// Solid 1.x flushes effects on every unbatched write; batch() commits all
		// four channels atomically so no effect sees a half-applied transition.
		batch(syncSignals);
	}, "all");
```

- [ ] **Step 4: Run to verify all pass**

Run: `pnpm --filter @gooonzick/wizard-solid exec vitest run tests/reactivity.test.ts tests/create-wizard.test.ts`
Expected: PASS (X6 either passes or is `it.fails` per the decision point).

- [ ] **Step 5: Commit**

```bash
pnpm --filter @gooonzick/wizard-solid lint:fix
git add packages/solid/src/create-wizard.ts packages/solid/tests/reactivity.test.ts
git commit -m "feat(solid): batch channel signal updates atomically"
```

---

### Task 6: Actions and `field()`

**Files:**
- Test: `packages/solid/tests/actions.test.ts`, `packages/solid/tests/field.test.ts`

The implementation already exists (Task 4). These tests pin behaviour; they should pass on first run. If one fails, fix `create-wizard.ts` to match the Svelte runes binding, never the test.

- [ ] **Step 1: Write `packages/solid/tests/actions.test.ts`**

```ts
import {
	WizardRestoreError,
	type WizardSerializedState,
} from "@gooonzick/wizard-core";
import { describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import type { CreateWizardOptions } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard(
	options: Partial<CreateWizardOptions<SignupData>> = {},
) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...options,
	});
}

describe("actions", () => {
	it("A1: updateData applies an updater", async () => {
		const wizard = makeWizard();
		await flush();

		wizard.actions.updateData((d) => ({ ...d, email: "a@b.c" }));

		expect(wizard.data.email).toBe("a@b.c");
	});

	it("A2: setData replaces the data", async () => {
		const wizard = makeWizard();
		await flush();

		wizard.actions.setData({ name: "ada", email: "a@b.c", plan: "pro" });

		expect(wizard.data).toEqual({ name: "ada", email: "a@b.c", plan: "pro" });
	});

	it("A3: validate toggles isValidating and exposes errors", async () => {
		const wizard = makeWizard();
		await flush();

		const pending = wizard.actions.validate();
		expect(wizard.isValidating).toBe(true);
		await pending;

		expect(wizard.isValidating).toBe(false);
		expect(wizard.isValid).toBe(false);
		expect(wizard.validationErrors?.name).toBe("Name is required");
	});

	it("A4: validateAll returns a summary and can persist step statuses", async () => {
		const wizard = makeWizard();
		await flush();

		const summary = await wizard.actions.validateAll({ updateStatuses: true });

		expect(summary.valid).toBe(false);
		expect(summary.invalidStepIds).toEqual(["personal"]);
		expect(wizard.stepStatuses.personal).toBe("error");
		expect(wizard.isValidating).toBe(false);
	});

	it("A5: canSubmit is true only on a valid LAST step", async () => {
		const wizard = makeWizard();
		await flush();

		expect(await wizard.actions.canSubmit()).toBe(false);
		wizard.actions.updateField("name", "ada");
		// Valid, but not the last step: machine.canSubmit() = valid && !nextStep.
		expect(await wizard.actions.canSubmit()).toBe(false);

		await wizard.goNext();
		await wizard.goNext();
		expect(wizard.currentStepId).toBe("summary");
		expect(await wizard.actions.canSubmit()).toBe(true);
	});

	it("A6: submit toggles isSubmitting and completes on the last step", async () => {
		const onComplete = vi.fn();
		const wizard = makeWizard({ onComplete });
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();
		await wizard.goNext();

		const pending = wizard.actions.submit();
		expect(wizard.isSubmitting).toBe(true);
		await pending;

		expect(wizard.isSubmitting).toBe(false);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(wizard.isCompleted).toBe(true);
	});

	it("A7: serialize + restore round-trips the position and data", async () => {
		const wizard = makeWizard();
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();
		const serialized = wizard.actions.serialize();

		wizard.actions.reset();
		await flush();
		expect(wizard.currentStepId).toBe("personal");

		wizard.actions.restore(serialized);
		// restore() emits synchronously and again from its fire-and-forget validate().
		await flush();
		await flush();

		expect(wizard.currentStepId).toBe("plan");
		expect(wizard.data.name).toBe("ada");
	});

	it("A8: restoring a malformed snapshot goes to onError, not an unhandled rejection", async () => {
		const onError = vi.fn();
		const unhandled = vi.fn();
		process.on("unhandledRejection", unhandled);
		try {
			const wizard = makeWizard({ onError });

			wizard.actions.restore({
				version: -1,
			} as unknown as WizardSerializedState<SignupData>);
			await flush();

			expect(onError).toHaveBeenCalledTimes(1);
			expect(onError.mock.calls[0][0]).toBeInstanceOf(WizardRestoreError);
			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			process.off("unhandledRejection", unhandled);
		}
	});

	it("A9: reset returns to the initial step and data with idle loading flags", async () => {
		const onReset = vi.fn();
		const wizard = makeWizard({ onReset });
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();

		wizard.actions.reset();
		await flush();

		expect(onReset).toHaveBeenCalled();
		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.data).toEqual(initialData);
		expect(wizard.loading).toEqual({
			isValidating: false,
			isSubmitting: false,
			isNavigating: false,
		});
	});

	it("A10: cancel calls onCancel and then resets", async () => {
		const onCancel = vi.fn();
		const wizard = makeWizard({ onCancel });
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();

		await wizard.actions.cancel();
		await flush();

		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.data.name).toBe("");
	});
});
```

- [ ] **Step 2: Write `packages/solid/tests/field.test.ts`**

```ts
import { createEffect, createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import type { CreateWizardOptions } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard(
	options: Partial<CreateWizardOptions<SignupData>> = {},
) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...options,
	});
}

describe("field()", () => {
	it("F1: returns a stable reference per key", () => {
		const wizard = makeWizard();

		expect(wizard.field("name")).toBe(wizard.field("name"));
		expect(wizard.field("name")).not.toBe(wizard.field("email"));
	});

	it("F2: writes route through updateField with changedFields = [key]", () => {
		const onDataChange = vi.fn();
		const wizard = makeWizard({ onDataChange });
		const name = wizard.field("name");

		name.value = "ada";

		expect(name.value).toBe("ada");
		expect(wizard.data.name).toBe("ada");
		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onDataChange.mock.calls[0][2]).toEqual(["name"]);
	});

	it("F3: writing the same value is a no-op (Object.is guard)", () => {
		const onDataChange = vi.fn();
		const onStateChange = vi.fn();
		const wizard = makeWizard({ onDataChange, onStateChange });
		const name = wizard.field("name");
		name.value = "ada";
		onStateChange.mockClear();

		name.value = "ada";

		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onStateChange).not.toHaveBeenCalled();
	});

	it("F4: reads are reactive", async () => {
		const wizard = makeWizard();
		await flush();
		const email = wizard.field("email");
		const seen: string[] = [];

		const dispose = createRoot((d) => {
			createEffect(() => {
				seen.push(email.value);
			});
			return d;
		});
		wizard.actions.updateField("email", "a@b.c");
		dispose();

		expect(seen).toEqual(["", "a@b.c"]);
	});
});
```

- [ ] **Step 3: Run both**

Run: `pnpm --filter @gooonzick/wizard-solid exec vitest run tests/actions.test.ts tests/field.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 4: Commit**

```bash
pnpm --filter @gooonzick/wizard-solid lint:fix
git add packages/solid/tests/actions.test.ts packages/solid/tests/field.test.ts
git commit -m "test(solid): cover actions and field()"
```

---

### Task 7: Listener isolation (test-first)

**Files:**
- Test: `packages/solid/tests/errors.test.tsx`
- Modify: `packages/solid/src/create-wizard.ts` (the subscription)

- [ ] **Step 1: Write `packages/solid/tests/errors.test.tsx`**

(`.tsx` because E2 renders an `<ErrorBoundary>`.)

```tsx
import { render, screen } from "@solidjs/testing-library";
import { createEffect, createRoot, ErrorBoundary } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import type { CreateWizardOptions, Wizard } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard(
	options: Partial<CreateWizardOptions<SignupData>> = {},
) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...options,
	});
}

const disposers: Array<() => void> = [];
afterEach(() => {
	for (const dispose of disposers.splice(0)) dispose();
});

describe("errors", () => {
	it("E1: a throwing effect without a boundary goes to onError and the wizard keeps working", async () => {
		const onError = vi.fn();
		const wizard = makeWizard({ onError });
		await flush();
		wizard.actions.updateField("name", "ada");

		createRoot((dispose) => {
			disposers.push(dispose);
			createEffect(() => {
				if (wizard.currentStepId === "plan") {
					throw new Error("boom");
				}
			});
		});

		await expect(wizard.goNext()).resolves.toBeUndefined();

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "boom" }),
		);
		// Assert through getters, NOT another effect: Solid 1.x leaves sibling
		// effects of the interrupted flush stale for good (see spec §5).
		expect(wizard.currentStepId).toBe("plan");

		await wizard.goPrevious();
		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.isNavigating).toBe(false);
	});

	it("E2: inside an <ErrorBoundary> Solid handles the error and onError is not called", async () => {
		const onError = vi.fn();
		const wizard = makeWizard({ onError });
		await flush();
		wizard.actions.updateField("name", "ada");

		function Thrower(props: { wizard: Wizard<SignupData> }) {
			createEffect(() => {
				if (props.wizard.currentStepId === "plan") {
					throw new Error("boom");
				}
			});
			return <p>step: {props.wizard.currentStepId}</p>;
		}

		render(() => (
			<ErrorBoundary fallback={<p>caught</p>}>
				<Thrower wizard={wizard} />
			</ErrorBoundary>
		));

		await wizard.goNext();

		expect(await screen.findByText("caught")).toBeTruthy();
		expect(onError).not.toHaveBeenCalled();
		expect(wizard.currentStepId).toBe("plan");
	});
});
```

- [ ] **Step 2: Run it — E1 must FAIL**

Run: `pnpm --filter @gooonzick/wizard-solid exec vitest run tests/errors.test.tsx`
Expected: E1 FAILS (`goNext()` rejects with `boom` because the exception escapes into the machine). E2 PASSES.

- [ ] **Step 3: Wrap the batched sync in `try/catch`**

In `packages/solid/src/create-wizard.ts` replace

```ts
	manager.subscribe(() => {
		// Solid 1.x flushes effects on every unbatched write; batch() commits all
		// four channels atomically so no effect sees a half-applied transition.
		batch(syncSignals);
	}, "all");
```

with

```ts
	manager.subscribe(() => {
		try {
			// Solid 1.x flushes effects on every unbatched write; batch() commits all
			// four channels atomically so no effect sees a half-applied transition.
			batch(syncSignals);
		} catch (error) {
			// Effects run synchronously at the end of batch(), i.e. inside the
			// machine's notifyStateChange() (which has no try/catch). A user effect
			// that throws without an <ErrorBoundary> must not break a transition
			// mid-flight — report it instead. Solid itself may leave sibling effects
			// of this flush stale; the wizard (machine, manager, getters) is intact.
			reportError(error);
		}
	}, "all");
```

- [ ] **Step 4: Run to verify**

Run: `pnpm --filter @gooonzick/wizard-solid exec vitest run tests/errors.test.tsx tests/reactivity.test.ts tests/create-wizard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --filter @gooonzick/wizard-solid lint:fix
git add packages/solid/src/create-wizard.ts packages/solid/tests/errors.test.tsx
git commit -m "feat(solid): isolate throwing effects from the machine"
```

---

### Task 8: Teardown and plugins

**Files:**
- Test: `packages/solid/tests/teardown.test.ts`, `packages/solid/tests/plugins.test.ts`

Implementation exists (Task 4). After Step 3, do the mutation check in Step 4.

- [ ] **Step 1: Write `packages/solid/tests/teardown.test.ts`**

```ts
import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import type { CreateWizardOptions, Wizard } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard(
	options: Partial<CreateWizardOptions<SignupData>> = {},
) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...options,
	});
}

describe("teardown", () => {
	it("T1: disposing the owning root destroys the wizard and its plugins", async () => {
		const destroyPlugin = vi.fn();
		let wizard!: Wizard<SignupData>;
		const dispose = createRoot((d) => {
			wizard = makeWizard({ plugins: [{ name: "p", destroy: destroyPlugin }] });
			return d;
		});
		await flush();

		dispose();
		expect(wizard.isDestroyed).toBe(true);
		await flush();
		expect(destroyPlugin).toHaveBeenCalledTimes(1);
	});

	it("T2: autoDestroy:false keeps the wizard alive after the root is disposed", async () => {
		let wizard!: Wizard<SignupData>;
		const dispose = createRoot((d) => {
			wizard = makeWizard({ autoDestroy: false });
			return d;
		});

		dispose();
		await flush();

		expect(wizard.isDestroyed).toBe(false);
		await wizard.destroy();
		expect(wizard.isDestroyed).toBe(true);
	});

	it("T3: creating without an owner registers nothing and logs no warning", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const wizard = makeWizard();
			expect(wizard.isDestroyed).toBe(false);
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});

	it("T4: destroy() is idempotent", async () => {
		const destroyPlugin = vi.fn();
		const wizard = makeWizard({
			plugins: [{ name: "p", destroy: destroyPlugin }],
		});

		await expect(wizard.destroy()).resolves.toBeUndefined();
		await expect(wizard.destroy()).resolves.toBeUndefined();
		await flush();

		expect(destroyPlugin).toHaveBeenCalledTimes(1);
	});

	it("T5: after destroy() the signals stop following the manager", async () => {
		const wizard = makeWizard();
		await flush();

		await wizard.destroy();
		// destroy() cleared the manager's subscribers and the manager ignores
		// post-destroy writes; the observable guarantee is that signals stay put.
		const manager = wizard.getManager();
		expect(manager.isDestroyed).toBe(true);
		manager.setLoadingState({ isSubmitting: true });

		expect(wizard.isSubmitting).toBe(false);
		expect(wizard.currentStepId).toBe("personal");
	});
});
```

- [ ] **Step 2: Write `packages/solid/tests/plugins.test.ts`**

```ts
import {
	type TransitionEvent,
	WizardConfigurationError,
	type WizardPlugin,
} from "@gooonzick/wizard-core";
import { describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard(plugins?: WizardPlugin<SignupData>[]) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		plugins,
	});
}

describe("plugins", () => {
	it("P1: onInit is dispatched exactly once", async () => {
		const onInit = vi.fn();
		makeWizard([{ name: "p", onInit }]);

		await flush();

		expect(onInit).toHaveBeenCalledTimes(1);
	});

	it("P2: a vetoing beforeTransition leaves every visible field untouched", async () => {
		const wizard = makeWizard([{ name: "veto", beforeTransition: () => false }]);
		await flush();
		wizard.actions.updateField("name", "ada");
		const historyBefore = [...wizard.stepHistory];
		const statusesBefore = { ...wizard.stepStatuses };

		await wizard.goNext();
		await flush();

		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.stepHistory).toEqual(historyBefore);
		expect(wizard.stepStatuses).toEqual(statusesBefore);
	});

	it("P3: afterTransition receives the committed transition", async () => {
		const afterTransition = vi.fn<(e: TransitionEvent<SignupData>) => void>();
		const wizard = makeWizard([{ name: "after", afterTransition }]);
		await flush();
		wizard.actions.updateField("name", "ada");

		await wizard.goNext();
		await flush();

		expect(afterTransition).toHaveBeenCalledTimes(1);
		const event = afterTransition.mock.calls[0][0];
		expect(event.type).toBe("next");
		expect(event.fromStepId).toBe("personal");
		expect(event.toStepId).toBe("plan");
	});

	it("P4: duplicate plugin names throw from createWizard", () => {
		expect(() => makeWizard([{ name: "dup" }, { name: "dup" }])).toThrow(
			WizardConfigurationError,
		);
	});
});
```

- [ ] **Step 3: Run both**

Run: `pnpm --filter @gooonzick/wizard-solid exec vitest run tests/teardown.test.ts tests/plugins.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 4: Mutation check for `autoDestroy`**

Temporarily change `if (autoDestroy && getOwner()) {` to `if (autoDestroy) {` in `create-wizard.ts` and re-run `tests/teardown.test.ts`.
Expected: T3 FAILS (Solid logs "cleanups created outside a `createRoot` or `render` will never be run").
Then temporarily change it to `if (false) {` and re-run. Expected: T1 FAILS.
Restore `if (autoDestroy && getOwner()) {` and re-run: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --filter @gooonzick/wizard-solid lint:fix
git add packages/solid/tests/teardown.test.ts packages/solid/tests/plugins.test.ts
git commit -m "test(solid): cover teardown, autoDestroy and plugins"
```

---

### Task 9: Context and public exports (test-first)

**Files:**
- Create: `packages/solid/src/context.ts`
- Modify: `packages/solid/src/index.ts`
- Test: `packages/solid/tests/context.test.tsx`

- [ ] **Step 1: Write `packages/solid/tests/context.test.tsx`**

```tsx
import { render, screen } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import {
	createWizard,
	hasWizardContext,
	useWizardContext,
	type Wizard,
	WizardProvider,
} from "../src/index";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard() {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
	});
}

describe("context", () => {
	it("K1: a descendant receives the same wizard instance", () => {
		const wizard = makeWizard();
		let received: Wizard<SignupData> | undefined;
		let has = false;

		function Child() {
			received = useWizardContext<SignupData>();
			has = hasWizardContext();
			return <p>step: {received.currentStepId}</p>;
		}

		render(() => (
			<WizardProvider wizard={wizard}>
				<Child />
			</WizardProvider>
		));

		expect(received).toBe(wizard);
		expect(has).toBe(true);
		expect(screen.getByText("step: personal")).toBeTruthy();
	});

	it("K2: useWizardContext throws without a provider", () => {
		expect(() =>
			createRoot((dispose) => {
				try {
					return useWizardContext();
				} finally {
					dispose();
				}
			}),
		).toThrow(/WizardProvider/);
	});

	it("K3: hasWizardContext is false without a provider, even outside a root", () => {
		expect(hasWizardContext()).toBe(false);
		createRoot((dispose) => {
			expect(hasWizardContext()).toBe(false);
			dispose();
		});
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gooonzick/wizard-solid exec vitest run tests/context.test.tsx`
Expected: FAIL — `src/index.ts` is still the Task 1 placeholder, so e.g. `createWizard is not a function` / `WizardProvider` is undefined.

- [ ] **Step 3: Create `packages/solid/src/context.ts`**

```ts
import type { WizardData } from "@gooonzick/wizard-core";
import {
	createComponent,
	createContext,
	type JSX,
	useContext,
} from "solid-js";
import type { Wizard } from "./types";

// One context for every Wizard<T>; useWizardContext<T>() narrows it.
// biome-ignore lint/suspicious/noExplicitAny: the context value is generic per call site
const WizardContext = createContext<Wizard<any> | undefined>(undefined);

export interface WizardProviderProps<T extends WizardData> {
	/** An existing wizard from `createWizard()`. Read once; the provider never destroys it. */
	wizard: Wizard<T>;
	children?: JSX.Element;
}

/**
 * Publishes an existing wizard to descendants. Written with `createComponent`
 * (no JSX) so the package ships as plain TypeScript.
 */
export function WizardProvider<T extends WizardData>(
	props: WizardProviderProps<T>,
): JSX.Element {
	return createComponent(WizardContext.Provider, {
		value: props.wizard,
		get children() {
			return props.children;
		},
	});
}

/** @throws Error when no ancestor rendered `<WizardProvider wizard={...}>`. */
export function useWizardContext<T extends WizardData>(): Wizard<T> {
	const wizard = useContext(WizardContext);
	if (!wizard) {
		throw new Error(
			"useWizardContext() must be called inside a <WizardProvider wizard={...}>.",
		);
	}
	return wizard as Wizard<T>;
}

/** Non-throwing probe; `useContext` returns the default outside a provider or owner. */
export function hasWizardContext(): boolean {
	return useContext(WizardContext) !== undefined;
}
```

- [ ] **Step 4: Replace `packages/solid/src/index.ts`**

```ts
// Re-export from core/state for convenience so consumers do not need a direct
// dependency on @gooonzick/wizard-state.

export type {
	WizardProgress,
	WizardSerializedState,
} from "@gooonzick/wizard-core";
export { WizardRestoreError } from "@gooonzick/wizard-core";
export {
	type LoadingState,
	type NavigationState,
	type StateSnapshot,
	type SubscriptionChannel,
	type ValidationState,
	WizardStateManager,
} from "@gooonzick/wizard-state";
export {
	hasWizardContext,
	useWizardContext,
	WizardProvider,
	type WizardProviderProps,
} from "./context";
export { createWizard } from "./create-wizard";
export type {
	CreateWizardOptions,
	Wizard,
	WizardField,
	WizardStoreActions,
	WizardStoreLoading,
	WizardStoreNavigation,
	WizardStoreState,
	WizardStoreValidation,
} from "./types";
```

- [ ] **Step 5: Run to verify**

Run: `pnpm --filter @gooonzick/wizard-solid exec vitest run tests/context.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
pnpm --filter @gooonzick/wizard-solid lint:fix
git add packages/solid/src/context.ts packages/solid/src/index.ts packages/solid/tests/context.test.tsx
git commit -m "feat(solid): add WizardProvider and context helpers"
```

---

### Task 10: Component test, type test, full verification, package README

**Files:**
- Test: `packages/solid/tests/components/wizard.test.tsx`, `packages/solid/tests/types.test.ts`
- Create: `packages/solid/README.md`

- [ ] **Step 1: Write `packages/solid/tests/components/wizard.test.tsx`**

Note: `canGoNext` means "a next step exists", not "the current step is valid". Validation is enforced by `goNext()` itself, so the button is enabled once navigation is computed, and an invalid click shows the error.

```tsx
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { Match, Show, Switch } from "solid-js";
import { describe, expect, it } from "vitest";
import { createWizard, type Wizard } from "../../src/index";
import { flush } from "../helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "../helpers/wizard";

function SignupForm(props: { wizard: Wizard<SignupData> }) {
	const name = props.wizard.field("name");
	return (
		<div>
			<Switch>
				<Match when={props.wizard.currentStepId === "personal"}>
					<input
						aria-label="Name"
						value={name.value}
						onInput={(e) => {
							name.value = e.currentTarget.value;
						}}
					/>
					<Show when={props.wizard.validationErrors?.name}>
						{(message) => <p role="alert">{message()}</p>}
					</Show>
				</Match>
				<Match when={props.wizard.currentStepId === "plan"}>
					<p>Plan step</p>
				</Match>
			</Switch>
			<button
				type="button"
				disabled={!props.wizard.canGoNext || props.wizard.isNavigating}
				onClick={() => {
					void props.wizard.goNext().catch(() => {});
				}}
			>
				Next
			</button>
		</div>
	);
}

describe("rendered component", () => {
	it("M1: the Next button is disabled until navigation is computed", async () => {
		const wizard = createWizard<SignupData>({
			definition: createTestDefinition(),
			initialData,
		});
		render(() => <SignupForm wizard={wizard} />);
		const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;

		expect(next.disabled).toBe(true);
		await flush();
		expect(next.disabled).toBe(false);
	});

	it("M2: an invalid click shows the validation error and stays on the step", async () => {
		const wizard = createWizard<SignupData>({
			definition: createTestDefinition(),
			initialData,
		});
		render(() => <SignupForm wizard={wizard} />);
		await flush();

		fireEvent.click(screen.getByRole("button", { name: "Next" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"Name is required",
		);
		expect(screen.getByLabelText("Name")).toBeTruthy();
	});

	it("M3: typing binds through field() and Next swaps the step", async () => {
		const wizard = createWizard<SignupData>({
			definition: createTestDefinition(),
			initialData,
		});
		render(() => <SignupForm wizard={wizard} />);
		await flush();

		fireEvent.input(screen.getByLabelText("Name"), {
			target: { value: "ada" },
		});
		expect(wizard.data.name).toBe("ada");

		fireEvent.click(screen.getByRole("button", { name: "Next" }));

		expect(await screen.findByText("Plan step")).toBeTruthy();
		expect(wizard.currentStepId).toBe("plan");
	});
});
```

- [ ] **Step 2: Write `packages/solid/tests/types.test.ts`**

```ts
import { describe, expect, expectTypeOf, it } from "vitest";
import { createWizard, type WizardField } from "../src/index";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

/**
 * Compile-time assertions. `vitest` strips types, so a green run proves nothing
 * here — `pnpm typecheck` (tsc --build) is the gate that actually validates this
 * file. The runtime body only exists so vitest reports the file.
 */
describe("types", () => {
	it("Y1-Y5: the public surface type-checks as documented", () => {
		// Y1: T is inferred from `definition` without an explicit type argument.
		const wizard = createWizard({
			definition: createTestDefinition(),
			initialData,
			autoDestroy: false,
		});
		expectTypeOf(wizard.data).toEqualTypeOf<SignupData>();

		// Y2: field() is typed by the field's own type.
		const name: WizardField<string> = wizard.field("name");
		expect(name).toBeDefined();

		// Y3: unknown keys are rejected.
		// @ts-expect-error - "nope" is not a key of SignupData
		wizard.field("nope");

		// Y4: the value type must match the field type.
		// @ts-expect-error - name is a string, not a number
		wizard.actions.updateField("name", 123);

		// Y5: flat getters are read-only. Never executed: assigning to a getter-only
		// property throws at runtime in strict mode.
		const neverCalled = () => {
			// @ts-expect-error - currentStepId is read-only
			wizard.currentStepId = "plan";
		};
		expect(typeof neverCalled).toBe("function");
	});
});
```

- [ ] **Step 3: Run the whole package with coverage**

Run: `pnpm --filter @gooonzick/wizard-solid exec vitest run --coverage`
Expected: all files PASS; coverage thresholds (70/60/60/70) met.

- [ ] **Step 4: Typecheck, build, lint**

Run: `pnpm turbo run build typecheck --filter=@gooonzick/wizard-solid && pnpm --filter @gooonzick/wizard-solid lint`
Expected: success. `packages/solid/dist/index.d.ts` exports `createWizard`, `WizardProvider`, `useWizardContext`, `hasWizardContext`. Verify: `grep -E "createWizard|WizardProvider|useWizardContext|hasWizardContext" packages/solid/dist/index.d.ts`.

Check the bundle contains no JSX runtime import: `grep -c "solid-js/web" packages/solid/dist/index.js` → `0`.

- [ ] **Step 5: Write `packages/solid/README.md`**

````markdown
# @gooonzick/wizard-solid

Solid.js integration for the Wizard framework — a signal-backed `createWizard()` with fine-grained reactive getters.

## Features

- **Signal-backed** - every property is a reactive getter; read it in JSX or `createEffect` and only that channel is tracked
- **Atomic updates** - state, navigation, validation and loading update in one `batch()`, so effects never see a half-applied transition
- **Two-way binding** - `wizard.field('name')` returns `{ get value, set value }` routed through `machine.updateField`
- **Context** - `<WizardProvider wizard={wizard}>` + `useWizardContext()` / `hasWizardContext()`
- **Owner-aware lifecycle** - destroyed with the owning component or `createRoot`; manual `destroy()` otherwise
- **Full Type Safety** - TypeScript generics for your data types

## Installation

```bash
npm install @gooonzick/wizard-solid @gooonzick/wizard-core
# or
pnpm add @gooonzick/wizard-solid @gooonzick/wizard-core
```

Requires `solid-js` 1.8 or newer (Solid 1.x). Solid 2.0 is not supported yet.

## Quick Start

```tsx
import { createLinearWizard } from "@gooonzick/wizard-core";
import { createWizard } from "@gooonzick/wizard-solid";
import { Match, Switch } from "solid-js";

type Signup = { name: string; plan: string };

const definition = createLinearWizard<Signup>({
	id: "signup",
	steps: [
		{
			id: "personal",
			title: "Personal",
			validate: async (d) =>
				d.name ? { valid: true } : { valid: false, errors: { name: "Required" } },
		},
		{ id: "plan", title: "Plan" },
	],
});

export function Signup() {
	const wizard = createWizard({
		definition,
		initialData: { name: "", plan: "basic" },
		onComplete: (data) => console.log("done", data),
	});
	const name = wizard.field("name");

	return (
		<form onSubmit={(e) => e.preventDefault()}>
			<h2>{wizard.currentStep.meta?.title}</h2>
			<Switch>
				<Match when={wizard.currentStepId === "personal"}>
					<input value={name.value} onInput={(e) => (name.value = e.currentTarget.value)} />
					<p>{wizard.validationErrors?.name}</p>
				</Match>
				<Match when={wizard.currentStepId === "plan"}>
					<p>Plan: {wizard.data.plan}</p>
				</Match>
			</Switch>
			<button type="button" onClick={() => wizard.goPrevious()} disabled={!wizard.canGoPrevious}>
				Back
			</button>
			<button type="button" onClick={() => wizard.goNext()} disabled={!wizard.canGoNext || wizard.isNavigating}>
				Next
			</button>
		</form>
	);
}
```

## Reactivity rules

- Read properties **inside** JSX, `createEffect` or `createMemo`. Destructuring (`const { canGoNext } = wizard`) reads once and loses reactivity — same as Solid props.
- Tracking is per channel (`state`, `navigation`, `validation`, `loading`), not per field.
- `definition`, `initialData`, `context` and `plugins` are read once. Recreate the wizard to reconfigure.

## Lifecycle

Created inside a component or `createRoot`, the wizard is destroyed with its owner (`autoDestroy: true` by default). Created elsewhere (module scope, a shared store), call `await wizard.destroy()` yourself.

## Errors

Machine errors go to `onError`. A `createEffect` that throws while the wizard updates its signals is also reported to `onError` (unless an `<ErrorBoundary>` catches it first): the wizard keeps working, but Solid may leave other effects of that update stale — wrap user effects in `<ErrorBoundary>` or `catchError`.

## Documentation

- [Solid Integration guide](https://gooonzick.github.io/wizard/guide/solid-integration)
- [Solid API reference](https://gooonzick.github.io/wizard/guide/api/solid)

## License

MIT
````

- [ ] **Step 6: Run knip for the package**

Run: `pnpm knip --workspace packages/solid`
Expected: no unused files/exports/dependencies for `packages/solid`. (The `examples/solid-examples` workspace entry is only checked from Task 11 onward.)

- [ ] **Step 7: Commit**

```bash
pnpm --filter @gooonzick/wizard-solid lint:fix
git add packages/solid
git commit -m "test(solid): add component and type tests; add package README"
```

---

### Task 11: Example app `examples/solid-examples`

**Files:** all under `examples/solid-examples/` (see file map).

- [ ] **Step 1: Create `examples/solid-examples/package.json`**

```json
{
	"name": "@gooonzick/wizard-solid-example",
	"private": true,
	"version": "0.0.0",
	"type": "module",
	"scripts": {
		"dev": "vite",
		"build": "vite build",
		"preview": "vite preview",
		"typecheck": "tsc --noEmit -p tsconfig.json",
		"lint": "biome check .",
		"lint:fix": "biome check . --write"
	},
	"dependencies": {
		"@gooonzick/wizard-core": "workspace:*",
		"@gooonzick/wizard-solid": "workspace:*",
		"solid-js": "^1.9.15"
	},
	"devDependencies": {
		"@biomejs/biome": "^2.5.3",
		"@types/node": "^26.1.1",
		"typescript": "^6.0.3",
		"vite": "^8.1.4",
		"vite-plugin-solid": "^2.11.14"
	}
}
```

- [ ] **Step 2: Create config files**

`examples/solid-examples/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
	plugins: [solid()],
});
```

`examples/solid-examples/tsconfig.json`:

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "ESNext",
		"lib": ["ES2022", "DOM", "DOM.Iterable"],
		"moduleResolution": "bundler",
		"allowSyntheticDefaultImports": true,
		"esModuleInterop": true,
		"isolatedModules": true,
		"moduleDetection": "force",
		"resolveJsonModule": true,
		"strict": true,
		"noUnusedLocals": true,
		"noUnusedParameters": true,
		"skipLibCheck": true,
		"noEmit": true,
		"jsx": "preserve",
		"jsxImportSource": "solid-js",
		"types": ["vite/client"]
	},
	"include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]
}
```

`examples/solid-examples/biome.json`:

```json
{
	"$schema": "https://biomejs.dev/schemas/2.5.3/schema.json",
	"extends": "//"
}
```

`examples/solid-examples/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WizardForm — Solid examples</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Copy the shared wizard and styles from the Svelte example**

```bash
mkdir -p examples/solid-examples/src/wizard
cp examples/svelte-examples/src/wizard/definition.ts examples/svelte-examples/src/wizard/initial-data.ts examples/svelte-examples/src/wizard/types.ts examples/solid-examples/src/wizard/
cp examples/svelte-examples/src/app.css examples/solid-examples/src/app.css
```

These files are framework-agnostic; do not edit them.

- [ ] **Step 4: Create `examples/solid-examples/src/main.tsx`**

```tsx
import { render } from "solid-js/web";
import { App } from "./App";
import "./app.css";

const target = document.getElementById("app");
if (!target) {
	throw new Error("#app container is missing from index.html");
}

render(() => <App />, target);
```

- [ ] **Step 5: Create `examples/solid-examples/src/App.tsx`**

```tsx
import { createSignal, For, Match, Switch } from "solid-js";
import { BasicExample } from "./BasicExample";
import { ContextExample } from "./ContextExample";

type Tab = "basic" | "context";

const TABS: Array<{ id: Tab; label: string }> = [
	{ id: "basic", label: "createWizard" },
	{ id: "context", label: "Context" },
];

export function App() {
	const [tab, setTab] = createSignal<Tab>("basic");

	return (
		<main>
			<h1>WizardForm — Solid examples</h1>
			<p class="lede">
				The same wizard driven by <code>@gooonzick/wizard-solid</code>. Switching
				tabs unmounts the previous demo, which destroys its machine — so each tab
				starts from a clean wizard.
			</p>

			<div class="tabs" role="tablist">
				<For each={TABS}>
					{({ id, label }) => (
						<button
							type="button"
							role="tab"
							aria-selected={tab() === id}
							onClick={() => setTab(id)}
						>
							{label}
						</button>
					)}
				</For>
			</div>

			<Switch>
				<Match when={tab() === "basic"}>
					<BasicExample />
				</Match>
				<Match when={tab() === "context"}>
					<ContextExample />
				</Match>
			</Switch>
		</main>
	);
}
```

- [ ] **Step 6: Create `examples/solid-examples/src/BasicExample.tsx`**

```tsx
import { createWizard } from "@gooonzick/wizard-solid";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { createSignupWizard } from "./wizard/definition";
import { initialData, PLANS } from "./wizard/initial-data";
import type { SignupData } from "./wizard/types";

export function BasicExample() {
	const [completed, setCompleted] = createSignal<SignupData | null>(null);

	// Created inside a component, so it is destroyed automatically on unmount.
	const wizard = createWizard<SignupData>({
		definition: createSignupWizard(),
		initialData,
		onComplete: (data) => setCompleted(data),
		onReset: () => setCompleted(null),
	});

	// `field(key)` is a stable `{ get value, set value }` pair backed by
	// `machine.updateField` — never mutate `wizard.data` directly.
	const name = wizard.field("name");
	const email = wizard.field("email");
	const plan = wizard.field("plan");

	return (
		<section class="panel">
			<h2>{wizard.currentStep.meta?.title}</h2>
			<p class="description">{wizard.currentStep.meta?.description}</p>

			<div class="progress">
				<span style={{ width: `${wizard.progress.percentage}%` }} />
			</div>

			<Switch>
				<Match when={wizard.currentStepId === "personal"}>
					<label>
						<span>Name</span>
						<input
							value={name.value}
							onInput={(e) => {
								name.value = e.currentTarget.value;
							}}
							placeholder="Ada Lovelace"
						/>
						<Show when={wizard.validationErrors?.name}>
							{(message) => <p class="error">{message()}</p>}
						</Show>
					</label>

					<label>
						<span>Email</span>
						<input
							value={email.value}
							onInput={(e) => {
								email.value = e.currentTarget.value;
							}}
							placeholder="ada@example.com"
						/>
						<Show when={wizard.validationErrors?.email}>
							{(message) => <p class="error">{message()}</p>}
						</Show>
					</label>
				</Match>

				<Match when={wizard.currentStepId === "plan"}>
					<label>
						<span>Plan</span>
						<select
							value={plan.value}
							onChange={(e) => {
								plan.value = e.currentTarget.value;
							}}
						>
							<For each={PLANS}>
								{(option) => <option value={option}>{option}</option>}
							</For>
						</select>
						<Show when={wizard.validationErrors?.plan}>
							{(message) => <p class="error">{message()}</p>}
						</Show>
					</label>
				</Match>

				<Match when={wizard.currentStepId === "summary"}>
					<dl class="debug">
						<dt>Name</dt>
						<dd>{wizard.data.name}</dd>
						<dt>Email</dt>
						<dd>{wizard.data.email}</dd>
						<dt>Plan</dt>
						<dd>{wizard.data.plan}</dd>
					</dl>

					<Show when={completed()}>
						<p class="description">
							Submitted — <code>onComplete</code> fired.
						</p>
					</Show>
				</Match>
			</Switch>

			<div class="controls">
				<button
					type="button"
					class="secondary"
					onClick={() => void wizard.goPrevious()}
					disabled={!wizard.canGoPrevious || wizard.isNavigating}
				>
					Back
				</button>

				<Show
					when={wizard.isLastStep}
					fallback={
						<button
							type="button"
							onClick={() => void wizard.goNext().catch(() => {})}
							disabled={!wizard.canGoNext || wizard.isNavigating}
						>
							{wizard.isNavigating ? "…" : "Next"}
						</button>
					}
				>
					<button
						type="button"
						onClick={() => void wizard.actions.submit()}
						disabled={wizard.isSubmitting || wizard.isCompleted}
					>
						{wizard.isSubmitting ? "Submitting…" : "Submit"}
					</button>
				</Show>

				<span class="spacer" />

				<button
					type="button"
					class="secondary"
					onClick={() => wizard.actions.reset()}
				>
					Reset
				</button>
			</div>

			<dl class="debug">
				<dt>currentStepId</dt>
				<dd>{wizard.currentStepId}</dd>
				<dt>progress</dt>
				<dd>
					{wizard.progress.currentStepIndex + 1} / {wizard.progress.enabledSteps}
				</dd>
				<dt>isValid</dt>
				<dd>{String(wizard.isValid)}</dd>
				<dt>isNavigating</dt>
				<dd>{String(wizard.isNavigating)}</dd>
				<dt>stepHistory</dt>
				<dd>{wizard.stepHistory.join(" → ")}</dd>
			</dl>
		</section>
	);
}
```

- [ ] **Step 7: Create `examples/solid-examples/src/ContextExample.tsx` and `ContextChild.tsx`**

`ContextExample.tsx`:

```tsx
import { createWizard, WizardProvider } from "@gooonzick/wizard-solid";
import { ContextChild } from "./ContextChild";
import { createSignupWizard } from "./wizard/definition";
import { initialData } from "./wizard/initial-data";
import type { SignupData } from "./wizard/types";

export function ContextExample() {
	// The parent owns the wizard; WizardProvider only publishes it.
	const wizard = createWizard<SignupData>({
		definition: createSignupWizard(),
		initialData,
	});

	return (
		<section class="panel">
			<h2>Context</h2>
			<p class="description">
				The parent owns the wizard and publishes it with{" "}
				<code>&lt;WizardProvider&gt;</code>; the child pulls it back out with{" "}
				<code>useWizardContext()</code> and never receives a prop.
			</p>

			<div class="controls">
				<button
					type="button"
					class="secondary"
					onClick={() => void wizard.goPrevious()}
					disabled={!wizard.canGoPrevious}
				>
					Back
				</button>
				<button
					type="button"
					onClick={() => void wizard.goNext().catch(() => {})}
					disabled={!wizard.canGoNext}
				>
					Next
				</button>
			</div>

			<WizardProvider wizard={wizard}>
				<ContextChild />
			</WizardProvider>
		</section>
	);
}
```

`ContextChild.tsx`:

```tsx
import { useWizardContext } from "@gooonzick/wizard-solid";
import type { SignupData } from "./wizard/types";

export function ContextChild() {
	const wizard = useWizardContext<SignupData>();
	const name = wizard.field("name");

	return (
		<div class="child">
			<label>
				<span>Name (bound from the child)</span>
				<input
					value={name.value}
					onInput={(e) => {
						name.value = e.currentTarget.value;
					}}
					placeholder="Ada Lovelace"
				/>
			</label>

			<dl class="debug">
				<dt>currentStepId</dt>
				<dd>{wizard.currentStepId}</dd>
				<dt>data.name</dt>
				<dd>{wizard.data.name || "—"}</dd>
			</dl>
		</div>
	);
}
```

- [ ] **Step 8: Create `examples/solid-examples/README.md`**

````markdown
# @gooonzick/wizard-solid-example

A deliberately minimal Vite + Solid app demonstrating
[`@gooonzick/wizard-solid`](../../packages/solid).

```bash
pnpm --filter @gooonzick/wizard-solid-example dev
pnpm --filter @gooonzick/wizard-solid-example build
```

## What it shows

| Tab | File | Covers |
| --- | ---- | ------ |
| **createWizard** | `src/BasicExample.tsx` | `createWizard`, reactive getters, `field()` two-way binding, `<Switch>/<Match>` on `currentStepId`, progress, validation errors, `isNavigating`, `submit()`, `reset()` |
| **Context** | `src/ContextExample.tsx` + `src/ContextChild.tsx` | `<WizardProvider>` / `useWizardContext()` — the child binds a field without receiving a single prop |

The wizard definition itself is framework-agnostic and lives in `src/wizard/` (identical to the Svelte example).

## Notes

- **Never mutate `wizard.data.x`.** Snapshots are frozen; bind through `wizard.field(key)`.
- **Do not destructure the wizard** (`const { canGoNext } = wizard`) — it reads once and loses reactivity, like Solid props.
- Each demo creates its wizard inside the component, so unmounting the tab destroys it.
````

- [ ] **Step 9: Install, typecheck, build, lint**

Run:

```bash
pnpm install
pnpm turbo run build --filter=@gooonzick/wizard-solid-example...
pnpm --filter @gooonzick/wizard-solid-example typecheck
pnpm --filter @gooonzick/wizard-solid-example lint:fix
pnpm knip
```

Expected: build writes `examples/solid-examples/dist/`; typecheck and lint pass; knip reports nothing new for `packages/solid` or `examples/solid-examples`.

- [ ] **Step 10: Smoke-test in a browser**

Run `pnpm --filter @gooonzick/wizard-solid-example dev`, open the printed URL, and check: Next with empty fields shows both errors; filling name + valid email advances to Plan; Back returns; Submit on Summary shows "Submitted"; Reset clears; switching to the Context tab and typing in the child updates `data.name`. Stop the dev server.

- [ ] **Step 11: Commit**

```bash
git add examples/solid-examples pnpm-lock.yaml
git commit -m "feat(examples): add Solid example app"
```

---

### Task 12: Documentation

**Files:**
- Create: `docs/solid-integration.md`, `docs/api/solid.md`, `packages/docs/guide/solid-integration.md`, `packages/docs/guide/api/solid.md`
- Modify: `docs/README.md`, `docs/api-reference.md`, `docs/getting-started.md`, `docs/ci-cd.md`, `packages/docs/guide/getting-started.md`, `packages/docs/guide/ci-cd.md`, `packages/docs/index.md`, `packages/docs/.vitepress/config.ts`, `README.md`

**Copy rule (applies to both new pages):** write the `docs/` version first. The `packages/docs/guide/` copy is identical except (a) it starts with VitePress front-matter, and (b) relative links become site-absolute: `./plugins.md` → `/guide/plugins`, `./plugins.md#anchor` → `/guide/plugins#anchor`, `../solid-integration.md` → `/guide/solid-integration`, `./api/solid.md` → `/guide/api/solid`, `./solid-integration.md` → `/guide/solid-integration`. This is exactly how `svelte-integration.md` differs between the two trees (`diff docs/svelte-integration.md packages/docs/guide/svelte-integration.md`).

- [ ] **Step 1: Write `docs/solid-integration.md`**

````markdown
# Solid Integration

`@gooonzick/wizard-solid` binds a `WizardMachine` to Solid signals. `createWizard()` returns an object whose properties are **reactive getters**: read them in JSX, `createEffect` or `createMemo` and Solid tracks exactly the channel you touched.

> Supports **Solid 1.x** (`solid-js` ≥ 1.8). Solid 2.0 is not supported yet.

## Installation

```bash
npm install @gooonzick/wizard-core @gooonzick/wizard-solid
# or
pnpm add @gooonzick/wizard-core @gooonzick/wizard-solid
```

## Quick Start

```tsx
import { createLinearWizard } from "@gooonzick/wizard-core";
import { createWizard } from "@gooonzick/wizard-solid";
import { Match, Show, Switch } from "solid-js";

type Signup = { name: string; email: string; plan: string };

const definition = createLinearWizard<Signup>({
	id: "signup",
	steps: [
		{
			id: "personal",
			title: "Personal info",
			validate: async (d) =>
				d.name ? { valid: true } : { valid: false, errors: { name: "Name is required" } },
		},
		{ id: "plan", title: "Plan" },
		{ id: "summary", title: "Summary" },
	],
});

export function SignupWizard() {
	const wizard = createWizard({
		definition,
		initialData: { name: "", email: "", plan: "basic" },
		onComplete: (data) => console.log("submitted", data),
	});
	const name = wizard.field("name");

	return (
		<section>
			<h2>{wizard.currentStep.meta?.title}</h2>
			<progress value={wizard.progress.percentage} max="100" />

			<Switch>
				<Match when={wizard.currentStepId === "personal"}>
					<input value={name.value} onInput={(e) => (name.value = e.currentTarget.value)} />
					<Show when={wizard.validationErrors?.name}>{(msg) => <p>{msg()}</p>}</Show>
				</Match>
				<Match when={wizard.currentStepId === "plan"}>{/* … */}</Match>
				<Match when={wizard.currentStepId === "summary"}>{/* … */}</Match>
			</Switch>

			<button onClick={() => wizard.goPrevious()} disabled={!wizard.canGoPrevious}>
				Back
			</button>
			<Show
				when={wizard.isLastStep}
				fallback={
					<button onClick={() => wizard.goNext()} disabled={!wizard.canGoNext || wizard.isNavigating}>
						Next
					</button>
				}
			>
				<button onClick={() => wizard.actions.submit()} disabled={wizard.isSubmitting}>
					Submit
				</button>
			</Show>
		</section>
	);
}
```

## The `wizard` object

| Group | Members |
| ----- | ------- |
| Flat getters | `currentStepId`, `currentStep`, `data`, `isCompleted`, `stepStatuses`, `progress`, `isValid`, `validationErrors`, `canGoNext`, `canGoPrevious`, `canGoBack`, `isFirstStep`, `isLastStep`, `visitedSteps`, `availableSteps`, `stepHistory`, `isValidating`, `isSubmitting`, `isNavigating` |
| Slices | `state`, `navigation`, `validation`, `loading` — the manager's frozen snapshots |
| Navigation | `goNext()`, `goPrevious()`, `goTo(stepId, options?)` (+ deprecated `goBack`, `goToStep`) |
| Actions | `wizard.actions.updateField`, `updateData`, `setData`, `validate`, `validateAll`, `canSubmit`, `submit`, `reset`, `cancel`, `serialize`, `restore` |
| Binding | `field(key)` |
| Escape hatches | `getMachine()`, `getManager()`, `destroy()`, `isDestroyed` |

The shape matches the Svelte runes API (`@gooonzick/wizard-svelte/runes`), so code and docs translate one-to-one.

## Reactivity

- **Read inside a tracking scope.** `wizard.canGoNext` in JSX re-renders when navigation changes. `const { canGoNext } = wizard` reads once and never updates — the same rule as Solid props.
- **Per-channel tracking.** The wizard holds four signals: `state`, `navigation`, `validation`, `loading`. Reading `wizard.data.name` subscribes to the whole `state` channel, so any data change re-runs that expression (DOM writes still only happen when the value differs).
- **Atomic updates.** All four signals are refreshed inside one `batch()`, so an effect never sees a new `currentStepId` together with a stale `canGoNext`.
- **Async navigation flags.** `canGoNext`, `canGoPrevious`, `isLastStep` and `availableSteps` are computed asynchronously (guards and resolvers may be async). Right after creation `canGoNext` is `false` until the first computation settles — disable buttons on it rather than assuming `true`.
- **Non-reactive options.** `definition`, `initialData`, `context` and `plugins` are read once. Recreate the wizard (e.g. inside a keyed `<Show>`) to reconfigure.

## Binding inputs with `field()`

```tsx
const email = wizard.field("email");

<input value={email.value} onInput={(e) => (email.value = e.currentTarget.value)} />;
```

`field(key)` returns a stable `{ get value, set value }` object per key. Reads are reactive; writes call `machine.updateField`, which skips no-op writes (`Object.is`) and reports `changedFields = [key]` to `onDataChange`. Never mutate `wizard.data` directly — snapshots are frozen.

## Sharing a wizard with context

```tsx
import { createWizard, useWizardContext, WizardProvider } from "@gooonzick/wizard-solid";

function Parent() {
	const wizard = createWizard({ definition, initialData });
	return (
		<WizardProvider wizard={wizard}>
			<Step />
		</WizardProvider>
	);
}

function Step() {
	const wizard = useWizardContext<Signup>();
	return <p>{wizard.currentStepId}</p>;
}
```

- `WizardProvider` takes an **existing** wizard. Creation and ownership stay with the parent; the provider never destroys it. The `wizard` prop is read once.
- `useWizardContext<T>()` throws if no provider is above it. `hasWizardContext()` is a non-throwing probe.

## Lifecycle

- Created inside a component or `createRoot`, the wizard registers `onCleanup` and is destroyed with its owner (`autoDestroy: true`, the default). Plugins' `destroy()` hooks run in reverse order.
- Created without an owner (module scope, a shared store), nothing is registered — call `await wizard.destroy()` yourself. Pass `autoDestroy: false` to keep a component-created wizard alive past unmount.
- After `destroy()` the getters keep their last values and stop updating.

## Plugins

```ts
import { createLoggingPlugin } from "@gooonzick/wizard-core";

const wizard = createWizard({ definition, initialData, plugins: [createLoggingPlugin()] });
```

Plugins are registered once at creation. See the [plugin contract](./plugins.md) and the [persistence plugin](./plugins.md#built-in-plugin-createpersistenceplugin).

## Error handling

- Machine errors (validation, lifecycle hooks, plugins, `onDataChange` subscribers) go to `onError`.
- `goNext`, `goPrevious`, `goTo`, `submit`, `validate`, `validateAll` and `cancel` return promises that reject on failure (e.g. `goNext()` on an invalid step). Loading flags are always reset.
- `reset()` and `restore()` are fire-and-forget; a malformed snapshot (`WizardRestoreError`) is reported to `onError`, never as an unhandled rejection.
- **Throwing effects.** Solid 1.x runs effects synchronously when the wizard updates its signals — inside the machine's transition. If a `createEffect` throws and no `<ErrorBoundary>` catches it, the wizard reports the error to `onError` and keeps working. Solid itself may leave other effects from that same update stale, so wrap effect-heavy UI in `<ErrorBoundary>` or use `catchError`.
- **Writes from effects.** Because effects run inside the transition, an effect that calls `wizard.actions.updateField(...)` when a step is entered re-enters the machine mid-transition. This works, but prefer step `onEnter` hooks for data initialisation.

## Limitations

- Solid 1.x only (`solid-js` ≥ 1.8).
- No SSR guarantees: Solid signals are not reactive on the server.
- `definition`, `initialData`, `context` and `plugins` are not reactive.
- Swapping the `wizard` passed to `WizardProvider` at runtime is not supported.

## See also

- [Solid API reference](./api/solid.md)
- [Plugins](./plugins.md)
- [Example app](../examples/solid-examples)
````

**If Task 5's X6 was marked `it.fails`**, replace the "Writes from effects" bullet with: "**Writes from effects are not supported yet.** An effect that calls `wizard.actions.updateField(...)` while a step is being entered can lose the write. Initialise step data in the step's `onEnter` hook instead."

In the `packages/docs/guide/` copy, change the last "See also" item to `- [Example app](https://github.com/gooonzick/wizard/tree/main/examples/solid-examples)`.

- [ ] **Step 2: Write `docs/api/solid.md`**

````markdown
# Solid API

API reference for `@gooonzick/wizard-solid`.

## `createWizard(options)`

```ts
function createWizard<T extends WizardData>(options: CreateWizardOptions<T>): Wizard<T>;
```

Creates a `WizardMachine` and a `WizardStateManager` and mirrors the manager's four channel snapshots into Solid signals.

### `CreateWizardOptions<T>`

| Option | Type | Default | Notes |
| ------ | ---- | ------- | ----- |
| `definition` | `WizardDefinition<T>` | — | Read once. |
| `initialData` | `T` | — | Read once. Also the default for `actions.reset()`. |
| `context` | `WizardContext` | `{}` | Read once. |
| `plugins` | `WizardPlugin<T>[]` | — | Registered once at creation. |
| `autoDestroy` | `boolean` | `true` | Registers `onCleanup(destroy)` when an owner exists. |
| `onStateChange` | `(state: WizardState<T>) => void` | — | |
| `onStepEnter` | `(stepId: StepId, data: T) => void` | — | |
| `onStepLeave` | `(stepId: StepId, data: T) => void` | — | |
| `onComplete` | `(data: T) => void` | — | |
| `onCancel` | `(data: T) => void \| Promise<void>` | — | |
| `onReset` | `() => void` | — | |
| `onError` | `(error: Error) => void` | — | Machine errors and effect errors thrown during signal updates. |
| `onDataChange` | `(prev: T, next: T, changedFields: (keyof T)[]) => void` | — | |

### `Wizard<T>`

**Reactive getters (read-only)**

| Getter | Type | Channel |
| ------ | ---- | ------- |
| `currentStepId` | `StepId` | state |
| `currentStep` | `WizardStepDefinition<T>` | state |
| `data` | `T` | state |
| `isCompleted` | `boolean` | state |
| `stepStatuses` | `Record<StepId, StepStatus>` | state |
| `progress` | `WizardProgress` | state |
| `isValid` | `boolean` | validation |
| `validationErrors` | `Record<string, string> \| undefined` | validation |
| `canGoNext` | `boolean` | navigation (async) |
| `canGoPrevious` | `boolean` | navigation (async) |
| `canGoBack` | `boolean` | navigation |
| `isFirstStep` | `boolean` | navigation |
| `isLastStep` | `boolean` | navigation (async) |
| `visitedSteps` | `StepId[]` | navigation |
| `availableSteps` | `StepId[]` | navigation (async) |
| `stepHistory` | `StepId[]` | navigation |
| `isValidating` | `boolean` | loading |
| `isSubmitting` | `boolean` | loading |
| `isNavigating` | `boolean` | loading |
| `state` | `WizardStoreState<T>` | state |
| `validation` | `WizardStoreValidation` | validation |
| `navigation` | `WizardStoreNavigation` | navigation |
| `loading` | `WizardStoreLoading` | loading |

**Navigation**

| Method | Returns | Notes |
| ------ | ------- | ----- |
| `goNext()` | `Promise<void>` | Validates, runs `onSubmit`, moves. Rejects on invalid step. Toggles `isNavigating`. |
| `goPrevious()` | `Promise<void>` | Toggles `isNavigating`. |
| `goTo(stepId, options?)` | `Promise<void>` | `GoToOptions`: `skipValidation`, `skipLifecycle`. |
| `goBack(steps?)` | `Promise<void>` | Deprecated — use `goPrevious()`. |
| `goToStep(stepId)` | `Promise<void>` | Deprecated — `goTo(stepId, { skipValidation: true })`. |

**`actions: WizardStoreActions<T>`**

| Action | Signature | Notes |
| ------ | --------- | ----- |
| `updateField` | `<K extends keyof T>(field: K, value: T[K]) => void` | No-op when `Object.is`-equal. |
| `updateData` | `(updater: (data: T) => T) => void` | |
| `setData` | `(data: T) => void` | |
| `validate` | `() => Promise<void>` | Toggles `isValidating`. |
| `validateAll` | `(options?: { updateStatuses?: boolean }) => Promise<ValidationSummary>` | Toggles `isValidating`. |
| `canSubmit` | `() => Promise<boolean>` | |
| `submit` | `() => Promise<void>` | Toggles `isSubmitting`. |
| `reset` | `(data?: T) => void` | Fire-and-forget; errors → `onError`. |
| `cancel` | `() => Promise<void>` | Calls `onCancel`, then resets. |
| `serialize` | `() => WizardSerializedState<T>` | |
| `restore` | `(state: WizardSerializedState<T>) => void` | Fire-and-forget; `WizardRestoreError` → `onError`. |

**Other members**

| Member | Type | Notes |
| ------ | ---- | ----- |
| `field(key)` | `<K extends keyof T>(key: K) => WizardField<T[K]>` | Stable per key. |
| `getMachine()` | `WizardMachine<T>` | |
| `getManager()` | `WizardStateManager<T>` | |
| `destroy()` | `Promise<void>` | Idempotent. |
| `isDestroyed` | `boolean` | |

### `WizardField<V>`

```ts
interface WizardField<V> {
	get value(): V; // reactive
	set value(v: V); // machine.updateField(key, v)
}
```

## Context

### `WizardProvider`

```ts
function WizardProvider<T extends WizardData>(props: WizardProviderProps<T>): JSX.Element;

interface WizardProviderProps<T extends WizardData> {
	wizard: Wizard<T>; // read once; never destroyed by the provider
	children?: JSX.Element;
}
```

### `useWizardContext<T>()`

Returns the nearest provided `Wizard<T>`. Throws `Error("useWizardContext() must be called inside a <WizardProvider wizard={...}>.")` when there is none.

### `hasWizardContext()`

Returns `true` when a `WizardProvider` is above the caller, otherwise `false`. Never throws.

## Re-exports

For convenience the package re-exports `WizardProgress`, `WizardSerializedState` and `WizardRestoreError` from `@gooonzick/wizard-core`, and `WizardStateManager`, `LoadingState`, `NavigationState`, `StateSnapshot`, `SubscriptionChannel`, `ValidationState` from `@gooonzick/wizard-state`.

## See also

- See the [Solid Integration guide](../solid-integration.md) for usage patterns
````

- [ ] **Step 3: Create the `packages/docs/guide/` copies**

`packages/docs/guide/solid-integration.md` = Step 1 content with this front-matter prepended and links rewritten per the copy rule:

```markdown
---
title: Solid Integration
description: How to use createWizard, field() and WizardProvider to integrate wizards into your Solid application
---
```

`packages/docs/guide/api/solid.md` = Step 2 content with:

```markdown
---
title: Solid API
description: API reference for the @gooonzick/wizard-solid package
---
```

and the last line `- See the [Solid Integration guide](/guide/solid-integration) for usage patterns`.

Verify: `diff docs/solid-integration.md packages/docs/guide/solid-integration.md` shows only front-matter and link lines.

- [ ] **Step 4: VitePress nav and sidebar — `packages/docs/.vitepress/config.ts`**

1. In `nav`, after `{ text: "Svelte Integration", link: "/guide/svelte-integration" },` add `{ text: "Solid Integration", link: "/guide/solid-integration" },`.
2. In the "Framework Integrations" sidebar group, after the Svelte item add:

```ts
						{
							text: "Solid Integration",
							link: "/guide/solid-integration",
						},
```

3. In the "API Reference" sidebar group, after `{ text: "Svelte API", link: "/guide/api/svelte" },` add `{ text: "Solid API", link: "/guide/api/solid" },`.

- [ ] **Step 5: Update install snippets and cross-links**

`docs/getting-started.md` **and** `packages/docs/guide/getting-started.md` (same edits in both):
- After the `# Svelte` / `npm install @gooonzick/wizard-core @gooonzick/wizard-svelte` lines add:
  ```
  # Solid
  npm install @gooonzick/wizard-core @gooonzick/wizard-solid
  ```
- After `# or: yarn add @gooonzick/wizard-core @gooonzick/wizard-svelte` add `# or: yarn add @gooonzick/wizard-core @gooonzick/wizard-solid`; same for the pnpm block (`# or: pnpm add @gooonzick/wizard-core @gooonzick/wizard-solid`).
- In "Core vs Framework Integrations", change the core bullet's "in vanilla TypeScript, Solid, or any other framework" to "in vanilla TypeScript or any other framework", and add after the Svelte bullet:
  `- **\`@gooonzick/wizard-solid\`**: Solid.js 1.x integration — \`createWizard()\` with signal-backed reactive getters, \`field()\` and \`WizardProvider\`.`

`docs/ci-cd.md` **and** `packages/docs/guide/ci-cd.md`: after the `@gooonzick/wizard-svelte@*` tag line add `- \`@gooonzick/wizard-solid@*\` - Release Solid package only`.

`docs/api-reference.md`: add table row `| \`@gooonzick/wizard-solid\` | [Solid API](./api/solid.md) |` after the Svelte row, and `- [Solid Integration](./solid-integration.md)` after the Svelte related-guide link.

`docs/README.md`:
- Guides table, after Svelte: `| [Solid Integration](./solid-integration.md) | Signals in Solid | Solid developers |`
- API table, after Svelte: `| Solid | [api/solid.md](./api/solid.md) |`
- "I want to…", after Svelte: `- **Use WizardForm in Solid** → [Solid Integration](./solid-integration.md)`
- Package docs, after Svelte: `- **@gooonzick/wizard-solid**: [packages/solid/README.md](../packages/solid/README.md)`; in the `wizard-state` line change `/ \`@gooonzick/wizard-svelte\`` to `/ \`@gooonzick/wizard-svelte\` / \`@gooonzick/wizard-solid\``.
- Examples, after Svelte: `- [examples/solid-examples](../examples/solid-examples) — createWizard, field binding, context`

`packages/docs/index.md`: change "For React, Vue or Svelte integration:" to "For React, Vue, Svelte or Solid integration:" and add `# or` / `npm install @gooonzick/wizard-solid` after the Svelte install line.

Root `README.md`:
- Features: after `- **Svelte Integration**: Svelte stores + Svelte 5 runes` add `- **Solid Integration**: Signal-backed \`createWizard()\` for Solid 1.x`.
- Installation: after the Svelte block add:
  ```
  # For Solid integration
  npm install @gooonzick/wizard-core @gooonzick/wizard-solid
  ```
- Package tree: change `│   └── svelte/                  # Svelte integration` to `│   ├── svelte/                  # Svelte integration` and its children's `│       ` prefixes to `│   │   ` (keep the same child lines), then add:
  ```
  │   └── solid/                   # Solid.js integration
  │       └── src/
  │           ├── create-wizard.ts # Signal-backed createWizard()
  │           └── context.ts       # WizardProvider / useWizardContext
  ```
  and in `examples/` change `│   └── svelte-examples/         # Svelte example application` to `│   ├── svelte-examples/         # Svelte example application` followed by `│   └── solid-examples/          # Solid example application`.

- [ ] **Step 6: Build the docs site**

Run: `pnpm docs:build`
Expected: success, no dead-link errors for `/guide/solid-integration` or `/guide/api/solid`.

- [ ] **Step 7: Commit**

```bash
pnpm lint:fix
git add docs packages/docs README.md
git commit -m "docs: add Solid integration guide and API reference"
```

---

### Task 13: Agent skill, contributor docs, changeset

**Files:**
- Modify: `.agents/skills/wizard-library/references/api_reference.md`, `.agents/skills/wizard-library/references/architecture_and_changes.md`, `AGENTS.md`, `CONTRIBUTING.md`
- Create: `.changeset/wiz-015-solid-integration.md`

- [ ] **Step 1: Agent skill — `api_reference.md`**

1. Line ~32: change "The React, Vue and Svelte adapters additionally re-export" to "The React, Vue, Svelte and Solid adapters additionally re-export".
2. After the Svelte bullet list (ends with the `autoDestroy` … `onDestroy` bullet), add:

```markdown
Solid (`@gooonzick/wizard-solid`, Solid 1.x) mirrors the Svelte runes surface with signals:

- `createWizard(options)` returns flat reactive getters (`wizard.currentStepId`,
  `wizard.canGoNext`, …), slice getters `state` / `validation` / `navigation` / `loading`,
  `actions`, `goNext`/`goPrevious`/`goTo` (+ deprecated `goBack`/`goToStep`),
  `field(key): { get value, set value }`, `getMachine()` / `getManager()`, `destroy()`
  and `isDestroyed`.
- Four signals (one per manager channel) are refreshed from ONE `"all"` subscription
  inside `batch()` (atomic) wrapped in `try/catch` (a throwing user effect goes to
  `onError`, never into the machine). Tracking is per channel, not per field.
- Context: `<WizardProvider wizard={wizard}>` (takes an existing wizard, never destroys
  it) + `useWizardContext<T>()` (throws without a provider) / `hasWizardContext()`.
- `autoDestroy` (default `true`) registers `onCleanup` only when `getOwner()` is non-null.
- Destructuring the wizard loses reactivity (like Solid props).
```

3. In the install snippet at the end, append ` @gooonzick/wizard-solid` to the `npm install …` line.

- [ ] **Step 2: Agent skill — `architecture_and_changes.md`**

1. Line ~29: "Do not re-implement machine behavior in React/Vue/Svelte adapters." → "…in React/Vue/Svelte/Solid adapters."
2. After list item 4 (Svelte adapter) in "Add/modify events", insert (renumber the following item to 6):

```markdown
5. Solid adapter — `packages/solid/src/create-wizard.ts` (machine callbacks) and
   `packages/solid/src/types.ts` (`CreateWizardOptions`).
```

3. Lines ~95 and ~109: "React, Vue and Svelte adapters" → "React, Vue, Svelte and Solid adapters"; "React/Vue/Svelte" → "React/Vue/Svelte/Solid".

- [ ] **Step 3: `AGENTS.md`**

After the `packages/svelte` bullet in "Monorepo Structure" add:

```markdown
- `packages/solid`: Solid.js 1.x integration — signal-backed `createWizard()` + `WizardProvider`
```

- [ ] **Step 4: `CONTRIBUTING.md`**

1. Tree: change `│   └── svelte/     # @gooonzick/wizard-svelte - Svelte integration (stores + runes)` to `│   ├── svelte/     # …same text…` and add `│   └── solid/      # @gooonzick/wizard-solid - Solid.js integration (signals)`.
2. Tests: after `pnpm --filter=@gooonzick/wizard-svelte test` add `pnpm --filter=@gooonzick/wizard-solid test`.
3. Scopes: after the `svelte` scope add `- \`solid\`: Changes to @gooonzick/wizard-solid`.

- [ ] **Step 5: Changeset `.changeset/wiz-015-solid-integration.md`**

```markdown
---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-state": minor
"@gooonzick/wizard-svelte": minor
"@gooonzick/wizard-vue": minor
"@gooonzick/wizard-solid": minor
---

Add `@gooonzick/wizard-solid` (WIZ-015): a Solid.js 1.x binding. `createWizard()` returns
flat reactive getters (`wizard.currentStepId`, `wizard.canGoNext`, ...) backed by one signal
per state-manager channel, refreshed atomically in a single `batch()`; slice getters;
`actions`; `wizard.field(key)` two-way bindings routed through `machine.updateField`;
`WizardProvider` / `useWizardContext` / `hasWizardContext`; and owner-aware teardown
(`onCleanup` when created under a Solid owner). A `createEffect` that throws while the
wizard updates its signals is reported to `onError` instead of breaking the transition.

All packages are released together at the same fixed version.
```

- [ ] **Step 6: Verify the changeset**

Run: `pnpm changeset status`
Expected: lists all six packages with a `minor` bump.

- [ ] **Step 7: Commit**

```bash
git add .agents/skills/wizard-library/references AGENTS.md CONTRIBUTING.md .changeset/wiz-015-solid-integration.md
git commit -m "docs(solid): update agent skill, contributor docs and add changeset"
```

---

### Task 14: ROADMAP, full verification, PR

**Files:**
- Modify: `docs/ROADMAP.md` (conditional)

- [ ] **Step 1: Check whether PR gooonzick/wizard#37 is merged**

Run: `gh pr view 37 --json state -q .state`

- If `MERGED`: run `git fetch origin && git rebase origin/main`, resolve conflicts if any, then do Step 2.
- If `OPEN`: skip Step 2 now; do Steps 3–5, and note in the PR body that the ROADMAP commit lands after #37. Return to Step 2 once #37 merges (before this PR merges).

- [ ] **Step 2: Update `docs/ROADMAP.md`** (post-#37 version of the file)

1. "What is Already Implemented" table: after the Svelte row add `| Solid signals binding (WIZ-015)                       | ✅     | \`solid\` |`.
2. "Current Release": change the fixed-group list to include `solid`; add release-table row `| 1.10.0  | \`@gooonzick/wizard-solid\` (WIZ-015) |`; remove `WIZ-015 (Solid.js)` from "Remaining backlog".
3. Competitor matrix: `✅ React/Vue/Svelte` → `✅ React/Vue/Svelte/Solid`.
4. WIZ-015 section: `**Status:** 📋 Planned` → `**Status:** ✅ Done (see "Shipped vs. specced deltas")`; append before the section's closing `---`:

```markdown
##### Shipped vs. specced deltas

- **API shape follows the Svelte runes binding**, not the sketch above: flat reactive
  getters (`wizard.currentStepId`, `wizard.canGoNext`) plus slice getters; navigation
  methods (`goNext`, `goTo`, …) live on the wizard itself, and `wizard.navigation` holds
  flags only — consistent with every other binding.
- **One signal per manager channel**, refreshed from a single `"all"` subscription inside
  `batch()` + `try/catch` (a throwing user effect is reported to `onError`).
- **`WizardProvider` takes an existing wizard** (`<WizardProvider wizard={wizard}>`),
  like Svelte's `setWizardContext`, rather than creation options.
- **Solid 1.x only** (`solid-js ^1.8.0`); Solid 2.0 is a follow-up.
- Shipped in **1.10.0**.
```

5. Appendix A: `WIZ-015 Solid Integration   ── independent                    📋` → `… ✅ 1.10.0`.

Commit:

```bash
git add docs/ROADMAP.md
git commit -m "docs(roadmap): mark WIZ-015 Solid integration as done"
```

- [ ] **Step 3: Full-repo verification**

Run each and confirm success:

```bash
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm knip
pnpm syncpack:lint
pnpm docs:build
```

Expected: all pass. If `pnpm test` fails in another package, confirm it also fails on `main` before assuming this branch caused it.

- [ ] **Step 4: Push**

```bash
git push -u origin feat/wiz-015-solid-integration
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --base main --head feat/wiz-015-solid-integration \
  --title "feat(solid): add @gooonzick/wizard-solid (WIZ-015)" \
  --body-file - <<'EOF'
Adds `@gooonzick/wizard-solid`, a Solid.js 1.x binding (WIZ-015). Spec: `docs/superpowers/specs/2026-09-25-wiz-015-solid-integration-design.md`.

## What's in it
- `createWizard()` — flat reactive getters + slices + `actions` + `field(key)`, same shape as the Svelte runes API.
- One signal per manager channel, refreshed in a single `batch()` (atomic) wrapped in `try/catch` (throwing user effects go to `onError`, not into the machine).
- `WizardProvider` / `useWizardContext` / `hasWizardContext`.
- Owner-aware teardown (`onCleanup` only under a Solid owner).
- Example app `examples/solid-examples`, docs guide + API reference (both doc trees), agent skill, CI/release wiring, changeset (fixed group → 1.10.0).

## Notes
- Solid 1.x only; 2.0 is a follow-up.
- <ROADMAP: included | lands in a follow-up commit after gooonzick/wizard#37 merges>
EOF
```

Replace the last bullet with the actual ROADMAP status before running.

- [ ] **Step 6: Report** the PR URL and, if Task 5's X6 was marked `it.fails`, the re-entrancy finding (for a separate core issue).

---

## Self-review notes (for the plan author)

- Spec §3 → Tasks 1–2; §4 → Tasks 3–6, 9; §5 lifecycle → Tasks 4, 8; §5 context → Task 9; §5 errors → Task 7; §6 tests → Tasks 4–10; §7 example → Task 11; §7 docs → Task 12; §7 release → Tasks 13–14.
- Deliberate deviation from spec §6 wording: the component test does NOT assert "Next disabled until valid" — `canGoNext` means "a next step exists", not "the step is valid"; validity is enforced by `goNext()`. M1/M2 test the real behaviour.
- `errors.test` is `.tsx` (spec listed `.ts`) because it renders an `<ErrorBoundary>`.
