# WIZ-002: goTo(stepId, options?) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `goToStep(stepId)` with `goTo(stepId, options?)` that supports skipping validation, guards, and lifecycle hooks, and deprecate `goToStep`.

**Architecture:** Extend `WizardMachine` with a new `goTo` method that validates the current step by default before navigating (consistent with `goNext`). Options control skipping validation, guards, and lifecycle. The private `navigateToStep` gains a `skipLifecycle` option. `goToStep` becomes a deprecated alias.

**Tech Stack:** TypeScript, Vitest, pnpm/turbo monorepo

---

### Task 1: Add GoToOptions interface and goTo method to WizardMachine

**Files:**
- Modify: `packages/core/src/machine/wizard-machine.ts`

**Step 1: Add GoToOptions interface**

After the `WizardEvents` interface (around line 42), add:

```typescript
/**
 * Options for the goTo() navigation method
 */
export interface GoToOptions {
	/** Skip validation of the current step before leaving (default: false) */
	skipValidation?: boolean;
	/** Skip checking the enabled guard on the target step (default: false) */
	skipGuards?: boolean;
	/** Skip onLeave/onEnter lifecycle hooks (default: false) */
	skipLifecycle?: boolean;
}
```

**Step 2: Extend the private navigateToStep options**

Change the signature of `navigateToStep` (line 476) from:

```typescript
private async navigateToStep(
	stepId: StepId,
	options?: { pushToHistory?: boolean },
): Promise<void> {
```

to:

```typescript
private async navigateToStep(
	stepId: StepId,
	options?: { pushToHistory?: boolean; skipLifecycle?: boolean },
): Promise<void> {
```

Then wrap the lifecycle hook calls in a condition. In the method body, destructure `skipLifecycle`:

```typescript
const { pushToHistory = true, skipLifecycle = false } = options ?? {};
```

Wrap the onLeave block:

```typescript
if (!skipLifecycle) {
	if (currentStep.onLeave) {
		await currentStep.onLeave(this.state.data, this.context);
	}
	this.events.onStepLeave?.(currentStep.id, this.state.data);
}
```

Wrap the onEnter block:

```typescript
if (!skipLifecycle) {
	if (targetStep.onEnter) {
		await targetStep.onEnter(this.state.data, this.context);
	}
	this.events.onStepEnter?.(stepId, this.state.data);
}
```

**Step 3: Add the goTo method**

Add this method right before the `goToStep` method (before line 370):

```typescript
/**
 * Navigates to a specific step with options to control validation, guards, and lifecycle.
 * @param stepId Target step ID
 * @param options Navigation options
 * @throws WizardNavigationError if step not found or disabled (when skipGuards is false)
 * @throws WizardValidationError if current step is invalid (when skipValidation is false)
 */
async goTo(stepId: StepId, options?: GoToOptions): Promise<void> {
	const {
		skipValidation = false,
		skipGuards = false,
		skipLifecycle = false,
	} = options ?? {};

	return this.withTransition(async () => {
		const targetStep = this.definition.steps[stepId];
		if (!targetStep) {
			throw new WizardNavigationError(
				`Step "${stepId}" not found`,
				stepId,
				"not-found",
			);
		}

		// No-op if already on the target step
		if (this.state.currentStepId === stepId) {
			return;
		}

		// Validate current step before leaving (unless skipped)
		if (!skipValidation) {
			const validationResult = await this.validate();
			if (!validationResult.valid) {
				throw new WizardValidationError(validationResult.errors || {});
			}
		}

		// Check if target step is enabled (unless skipped)
		if (!skipGuards) {
			const isEnabled = await evaluateGuard(
				targetStep.enabled,
				this.state.data,
				this.context,
			);

			if (!isEnabled) {
				throw new WizardNavigationError(
					`Step "${stepId}" is not enabled`,
					stepId,
					"disabled",
				);
			}
		}

		await this.navigateToStep(stepId, { skipLifecycle });
		this.debug(`Navigated to step: ${stepId}`);
	});
}
```

**Step 4: Deprecate goToStep**

Replace the existing `goToStep` method body with a thin delegation:

```typescript
/**
 * Jumps directly to a specific step (if enabled)
 * @deprecated Use `goTo(stepId)` instead. Will be removed in next major version.
 * Note: goToStep skips validation (unlike goTo which validates by default).
 */
async goToStep(stepId: StepId): Promise<void> {
	return this.goTo(stepId, { skipValidation: true });
}
```

**Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors)

**Step 6: Commit**

```bash
git add packages/core/src/machine/wizard-machine.ts
git commit -m "feat(core): add goTo(stepId, options) with GoToOptions, deprecate goToStep"
```

---

### Task 2: Export GoToOptions from core index

**Files:**
- Modify: `packages/core/src/index.ts`

**Step 1: Add GoToOptions to the machine exports**

Change line 42-45 from:

```typescript
export {
	type WizardEvents,
	WizardMachine,
	type WizardState,
} from "./machine/wizard-machine";
```

to:

```typescript
export {
	type GoToOptions,
	type WizardEvents,
	WizardMachine,
	type WizardState,
} from "./machine/wizard-machine";
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export GoToOptions type"
```

---

### Task 3: Write failing tests for goTo

**Files:**
- Modify: `packages/core/tests/navigation-history.test.ts`

**Step 1: Add a new describe block after the existing "goToStep adds to history" block**

Add this test suite at the end of the top-level `describe("Navigation History")` block:

```typescript
describe("goTo with options", () => {
	it("should navigate to an existing enabled step", async () => {
		const machine = new WizardMachine(
			createLinearDefinition(),
			defaultContext,
			defaultData,
		);

		await machine.goNext(); // → plan
		await machine.goTo("summary", { skipValidation: true });

		expect(machine.snapshot.currentStepId).toBe("summary");
	});

	it("should throw on non-existing step", async () => {
		const machine = new WizardMachine(
			createLinearDefinition(),
			defaultContext,
			defaultData,
		);

		await expect(
			machine.goTo("nonexistent", { skipValidation: true }),
		).rejects.toThrow("not found");
	});

	it("should no-op when navigating to current step", async () => {
		const events = {
			onStepLeave: vi.fn(),
			onStepEnter: vi.fn(),
		};
		const machine = new WizardMachine(
			createLinearDefinition(),
			defaultContext,
			defaultData,
			events,
		);

		// Clear initial onStepEnter call
		events.onStepEnter.mockClear();

		await machine.goTo("personal", { skipValidation: true });

		expect(machine.snapshot.currentStepId).toBe("personal");
		expect(events.onStepLeave).not.toHaveBeenCalled();
		expect(events.onStepEnter).not.toHaveBeenCalled();
	});

	it("should validate current step by default and throw on invalid", async () => {
		const definition = createLinearDefinition();
		// Add validator to personal step
		definition.steps.personal.validate = async (data) => ({
			valid: !!data.name,
			errors: data.name ? undefined : { name: "Name is required" },
		});

		const machine = new WizardMachine(
			definition,
			defaultContext,
			defaultData, // name is empty string → invalid
		);

		await expect(machine.goTo("plan")).rejects.toThrow();
		expect(machine.snapshot.currentStepId).toBe("personal"); // didn't navigate
	});

	it("should skip validation when skipValidation is true", async () => {
		const definition = createLinearDefinition();
		definition.steps.personal.validate = async (data) => ({
			valid: !!data.name,
			errors: data.name ? undefined : { name: "Name is required" },
		});

		const machine = new WizardMachine(
			definition,
			defaultContext,
			defaultData,
		);

		await machine.goTo("plan", { skipValidation: true });
		expect(machine.snapshot.currentStepId).toBe("plan");
	});

	it("should throw when target step is disabled and skipGuards is false", async () => {
		const definition = createLinearDefinition();
		definition.steps.invoice.enabled = false;

		const machine = new WizardMachine(
			definition,
			defaultContext,
			defaultData,
		);

		await expect(
			machine.goTo("invoice", { skipValidation: true }),
		).rejects.toThrow("not enabled");
	});

	it("should navigate to a disabled step when skipGuards is true", async () => {
		const definition = createLinearDefinition();
		definition.steps.invoice.enabled = false;

		const machine = new WizardMachine(
			definition,
			defaultContext,
			defaultData,
		);

		await machine.goTo("invoice", {
			skipValidation: true,
			skipGuards: true,
		});
		expect(machine.snapshot.currentStepId).toBe("invoice");
	});

	it("should skip lifecycle hooks when skipLifecycle is true", async () => {
		const onLeave = vi.fn();
		const onEnter = vi.fn();
		const definition = createLinearDefinition();
		definition.steps.personal.onLeave = onLeave;
		definition.steps.plan.onEnter = onEnter;

		const machine = new WizardMachine(
			definition,
			defaultContext,
			defaultData,
		);

		await machine.goTo("plan", {
			skipValidation: true,
			skipLifecycle: true,
		});

		expect(machine.snapshot.currentStepId).toBe("plan");
		expect(onLeave).not.toHaveBeenCalled();
		expect(onEnter).not.toHaveBeenCalled();
	});

	it("should call lifecycle hooks by default", async () => {
		const onLeave = vi.fn();
		const onEnter = vi.fn();
		const definition = createLinearDefinition();
		definition.steps.personal.onLeave = onLeave;
		definition.steps.plan.onEnter = onEnter;

		const machine = new WizardMachine(
			definition,
			defaultContext,
			defaultData,
		);

		await machine.goTo("plan", { skipValidation: true });

		expect(onLeave).toHaveBeenCalledOnce();
		expect(onEnter).toHaveBeenCalledOnce();
	});

	it("should push to navigation history", async () => {
		const machine = new WizardMachine(
			createLinearDefinition(),
			defaultContext,
			defaultData,
		);

		await machine.goTo("invoice", { skipValidation: true });

		expect(machine.history).toEqual(["personal", "invoice"]);
	});

	it("goToStep (deprecated) should still work and skip validation", async () => {
		const definition = createLinearDefinition();
		definition.steps.personal.validate = async (data) => ({
			valid: !!data.name,
			errors: data.name ? undefined : { name: "Name is required" },
		});

		const machine = new WizardMachine(
			definition,
			defaultContext,
			defaultData,
		);

		// goToStep should skip validation (backwards-compatible)
		await machine.goToStep("plan");
		expect(machine.snapshot.currentStepId).toBe("plan");
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run tests/navigation-history.test.ts`
Expected: FAIL — `machine.goTo is not a function` (method doesn't exist yet)

Note: This step will be run AFTER Task 1 implementation is complete, so tests should actually pass.

**Step 3: Run all tests**

Run: `pnpm test`
Expected: All tests pass (including existing goToStep tests, which use the deprecated alias)

**Step 4: Commit**

```bash
git add packages/core/tests/navigation-history.test.ts
git commit -m "test(core): add tests for goTo with GoToOptions"
```

---

### Task 4: Update React integration

**Files:**
- Modify: `packages/react/src/use-wizard.tsx`
- Modify: `packages/react/src/use-wizard-granular.tsx`

**Step 1: Import GoToOptions in use-wizard.tsx**

Add `GoToOptions` to the import from core (or from wizard-machine if importing directly). Find the import of `StepId` and add `GoToOptions` alongside it.

**Step 2: Update UseWizardNavigationActions interface**

Add `goTo` and mark `goToStep` as deprecated:

```typescript
export interface UseWizardNavigationActions {
	goNext: () => Promise<void>;
	goPrevious: () => Promise<void>;
	goBack: (steps?: number) => Promise<void>;
	goTo: (stepId: StepId, options?: GoToOptions) => Promise<void>;
	/** @deprecated Use goTo(stepId) instead */
	goToStep: (stepId: StepId) => Promise<void>;
}
```

**Step 3: Add goTo callback in use-wizard.tsx**

Before the existing `goToStep` callback, add:

```typescript
const goTo = useCallback(
	async (stepId: StepId, options?: GoToOptions) => {
		manager.setLoadingState({ isNavigating: true });
		try {
			await manager.getMachine().goTo(stepId, options);
		} finally {
			manager.setLoadingState({ isNavigating: false });
		}
	},
	[manager],
);
```

Update the `goToStep` callback to delegate:

```typescript
/** @deprecated Use goTo instead */
const goToStep = useCallback(
	async (stepId: StepId) => {
		return goTo(stepId, { skipValidation: true });
	},
	[goTo],
);
```

**Step 4: Add goTo to the navigation return object**

Add `goTo` to the useMemo return object and dependency array (alongside existing `goToStep`).

**Step 5: Repeat for use-wizard-granular.tsx**

Apply the same pattern: add `goTo` callback, deprecate `goToStep`, add to return and deps.

**Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/react/src/use-wizard.tsx packages/react/src/use-wizard-granular.tsx
git commit -m "feat(react): add goTo to useWizard hooks, deprecate goToStep"
```

---

### Task 5: Update Vue integration

**Files:**
- Modify: `packages/vue/src/types.ts`
- Modify: `packages/vue/src/use-wizard.ts`

**Step 1: Update types.ts**

Add `GoToOptions` import and update the navigation actions interface:

```typescript
export interface UseWizardNavigationActions {
	goNext: () => Promise<void>;
	goPrevious: () => Promise<void>;
	goBack: (steps?: number) => Promise<void>;
	goTo: (stepId: StepId, options?: GoToOptions) => Promise<void>;
	/** @deprecated Use goTo(stepId) instead */
	goToStep: (stepId: StepId) => Promise<void>;
}
```

**Step 2: Update use-wizard.ts**

Add `goTo` function and deprecate `goToStep`:

```typescript
const goTo = async (stepId: StepId, options?: GoToOptions) => {
	loadingState.isNavigating = true;
	try {
		await machine.value.goTo(stepId, options);
	} finally {
		loadingState.isNavigating = false;
	}
};

/** @deprecated Use goTo instead */
const goToStep = async (stepId: StepId) => {
	return goTo(stepId, { skipValidation: true });
};
```

Add `goTo` to the navigation slice return object.

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/vue/src/types.ts packages/vue/src/use-wizard.ts
git commit -m "feat(vue): add goTo to useWizard composable, deprecate goToStep"
```

---

### Task 6: Final verification

**Step 1: Run lint fix**

Run: `pnpm lint:fix`
Expected: No errors, auto-fixes applied

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 4: Final commit (if lint changed anything)**

```bash
git add -A
git commit -m "chore: lint fixes"
```
