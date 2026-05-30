# WIZ-007 review findings: backward-navigation veto safety & React StrictMode teardown

Investigation only. No code edited. Line numbers refer to the current branch.

Key files:
- `packages/core/src/machine/wizard-machine.ts`
- `packages/core/src/plugins/plugin-host.ts`
- `packages/react/src/use-wizard.tsx`
- `packages/react/src/wizard-provider.tsx`

---

## Finding 1 — beforeTransition veto is too late for backward navigation

### Verdict: REAL (High)

`goPrevious()` and `goBack()` mutate `stepHistory` (and `goPrevious`/`goTo` mutate
step status via `setStepStatusInternal`) **before** delegating to
`navigateToStep()`, which is the only place the plugin `beforeTransition` veto is
checked. A veto returns early without undoing those mutations, leaving corrupted
state.

### Evidence (exact ordering)

`navigateToStep` (wizard-machine.ts ~828-905) is where the veto lives:

```ts
private async navigateToStep(stepId, type, options?) {
  const { pushToHistory = true, skipLifecycle = false } = options ?? {};
  const currentStep = this.currentStep;
  const targetStep = this.definition.steps[stepId];
  const event = { type, fromStepId: currentStep.id, toStepId: stepId, ... };
  const proceed = await this.pluginHost.dispatchBeforeTransition(event);
  if (!proceed) {
    // Veto: silent cancel. No leave/enter, no state write, no afterTransition.
    return;                       // <-- returns; relies on caller having NOT mutated yet
  }
  ...
  if (pushToHistory) { this.stepHistory.push(stepId); }   // history mutation for FORWARD
  this.state = { ...this.state, currentStepId: stepId, ... };
  ...
}
```

**Forward (`goNext`, `goTo`) — safe.** The only history mutation for forward moves
is `this.stepHistory.push(stepId)`, which lives *inside* `navigateToStep` **after**
the veto check. So a veto on forward navigation pushes nothing. (`goNext` calls
`setStepStatusInternal(current, "completed")` before navigate, and `goTo` calls
`setStepStatusInternal(current, "visited")` before navigate — those status writes
are NOT rolled back on veto, a lesser pre-existing inconsistency, but `stepHistory`
and `currentStepId` stay correct.)

**Backward (`goPrevious` history branch) — corrupted.** wizard-machine.ts ~593-611:

```ts
async goPrevious() {
  return this.withTransition(async () => {
    if (this.stepHistory.length > 1) {
      this.stepHistory.pop();                                   // (A) MUTATION
      const previousStepId = this.stepHistory[this.stepHistory.length - 1];
      this.setStepStatusInternal(this.state.currentStepId, "visited"); // (B) MUTATION
      await this.navigateToStep(previousStepId, "previous", { pushToHistory: false });
      // ^ veto returns here WITHOUT undoing (A) or (B)
      return;
    }
    // resolver fallback (history empty):
    const previousStepId = await this.resolvePreviousStep();
    if (!previousStepId) throw new WizardNavigationError("No previous step available");
    this.setStepStatusInternal(this.state.currentStepId, "visited"); // (B') MUTATION
    await this.navigateToStep(previousStepId, "previous");
  });
}
```

On veto: `stepHistory` has already been popped (current step lost from history) and
the current step's status flipped to `"visited"`, yet `currentStepId` is unchanged
(no state write happened). Result: `stepHistory` no longer ends with the current
step → `history`, `canGoBack`, and the current step's status are all wrong.

**`goBack(steps)` — worse.** wizard-machine.ts ~632-672:

```ts
async goBack(steps = 1) {
  return this.withTransition(async () => {
    if (this.stepHistory.length - 1 < steps) throw new WizardNavigationError(...);
    for (let i = 0; i < steps; i++) { this.stepHistory.pop(); }  // (A) MUTATION (multi-pop)
    const targetStepId = this.stepHistory[this.stepHistory.length - 1];
    const targetStep = this.definition.steps[targetStepId];
    if (!targetStep) throw new WizardNavigationError(...);
    const isEnabled = await evaluateGuard(targetStep.enabled, ...);
    if (!isEnabled) throw new WizardNavigationError(...);
    await this.navigateToStep(targetStepId, "previous", { pushToHistory: false });
    // ^ veto returns here WITHOUT undoing the multi-pop
  });
}
```

`goBack` pops `steps` entries; a veto loses all of them irrecoverably.
(Note `goBack` does NOT call `setStepStatusInternal`, so only `stepHistory` is
corrupted for it.)

**No rollback exists.** There is no snapshot/restore around these mutations. The
staleness model (`transitionGen`/`isTransitionStale`, captured in `withTransition`,
wizard-machine.ts ~1426-1455) only guards against `reset()`/`cancel()` racing a
transition — it does NOT restore `stepHistory` on a veto. `withTransition`'s catch
only handles thrown errors; a veto is a normal `return`, not a throw.

### Root cause

The backward methods perform the history pop / status write as a *precondition
computation* (to discover `previousStepId`) and leave it applied even though the
authoritative go/no-go decision (`beforeTransition`) happens later inside
`navigateToStep`. Forward navigation avoids this because its sole history mutation
already lives after the veto.

### Proposed minimal fix

Move the destructive history/status mutations to **after** `beforeTransition`
succeeds. Cleanest approach respecting the existing architecture: have
`navigateToStep` own the backward pop, controlled by a new option, instead of the
callers popping eagerly. The callers compute the target *without mutating*, then
`navigateToStep` pops only once the veto has passed.

**Edit 1 — `navigateToStep` signature + a post-veto backward pop.**

Before (wizard-machine.ts ~828-840 + ~873-875):
```ts
private async navigateToStep(
  stepId: StepId,
  type: "next" | "previous" | "goTo",
  options?: { pushToHistory?: boolean; skipLifecycle?: boolean },
): Promise<void> {
  const { pushToHistory = true, skipLifecycle = false } = options ?? {};
  ...
  const proceed = await this.pluginHost.dispatchBeforeTransition(event);
  if (!proceed) { return; }
  if (this.isTransitionStale()) { return; }
  // ... onLeave ...
  // Update history stack
  if (pushToHistory) {
    this.stepHistory.push(stepId);
  }
```

After:
```ts
private async navigateToStep(
  stepId: StepId,
  type: "next" | "previous" | "goTo",
  options?: { pushToHistory?: boolean; skipLifecycle?: boolean; popHistory?: number },
): Promise<void> {
  const { pushToHistory = true, skipLifecycle = false, popHistory = 0 } = options ?? {};
  ...
  const proceed = await this.pluginHost.dispatchBeforeTransition(event);
  if (!proceed) { return; }
  if (this.isTransitionStale()) { return; }
  // ... onLeave ...
  // Update history stack (commit AFTER veto passed)
  if (popHistory > 0) {
    for (let i = 0; i < popHistory; i++) { this.stepHistory.pop(); }
  } else if (pushToHistory) {
    this.stepHistory.push(stepId);
  }
```
Note: `fromStepId`/`currentStep` are read at the top of `navigateToStep` BEFORE any
pop, so the `beforeTransition` event still reports the true current step as
`fromStepId`. Backward callers pass `pushToHistory: false` already, so the
`else if` keeps push suppressed.

**Edit 2 — `goPrevious` history branch: compute target without popping.**

Before:
```ts
if (this.stepHistory.length > 1) {
  this.stepHistory.pop();
  const previousStepId = this.stepHistory[this.stepHistory.length - 1];
  this.setStepStatusInternal(this.state.currentStepId, "visited");
  await this.navigateToStep(previousStepId, "previous", { pushToHistory: false });
  this.debug(`Navigated to previous step (from history): ${previousStepId}`);
  return;
}
```
After:
```ts
if (this.stepHistory.length > 1) {
  const previousStepId = this.stepHistory[this.stepHistory.length - 2];
  await this.navigateToStep(previousStepId, "previous", {
    pushToHistory: false,
    popHistory: 1,
  });
  this.debug(`Navigated to previous step (from history): ${previousStepId}`);
  return;
}
```
The `setStepStatusInternal(current, "visited")` is dropped from the caller — the
status of the step being left is handled inside the committed state write of
`navigateToStep` (it adds the target to `visitedSteps` and sets target status). If
preserving the explicit "mark the left step visited" behaviour is required, move
that exact call to AFTER the veto inside `navigateToStep` (guarded so it only runs
for `type === "previous"`). Recommend the simpler form above unless an existing test
asserts the left step becomes `"visited"` on backward nav — verify against
`packages/core/tests` before finalizing. (No such assertion was found in the veto
tests reviewed.)

**Edit 3 — `goPrevious` resolver fallback: move status write after veto.**

Before:
```ts
this.setStepStatusInternal(this.state.currentStepId, "visited");
await this.navigateToStep(previousStepId, "previous");
```
After (drop the eager status write; resolver fallback uses default
`pushToHistory: true`, which is its existing behaviour):
```ts
await this.navigateToStep(previousStepId, "previous");
```

**Edit 4 — `goBack`: compute target without popping.**

Before:
```ts
for (let i = 0; i < steps; i++) { this.stepHistory.pop(); }
const targetStepId = this.stepHistory[this.stepHistory.length - 1];
const targetStep = this.definition.steps[targetStepId];
if (!targetStep) throw new WizardNavigationError(`Step "${targetStepId}" not found`, targetStepId, "not-found");
const isEnabled = await evaluateGuard(targetStep.enabled, this.state.data, this.context);
if (!isEnabled) throw new WizardNavigationError(`Step "${targetStepId}" is no longer enabled`, targetStepId, "disabled");
await this.navigateToStep(targetStepId, "previous", { pushToHistory: false });
```
After:
```ts
const targetIndex = this.stepHistory.length - 1 - steps;
const targetStepId = this.stepHistory[targetIndex];
const targetStep = this.definition.steps[targetStepId];
if (!targetStep) throw new WizardNavigationError(`Step "${targetStepId}" not found`, targetStepId, "not-found");
const isEnabled = await evaluateGuard(targetStep.enabled, this.state.data, this.context);
if (!isEnabled) throw new WizardNavigationError(`Step "${targetStepId}" is no longer enabled`, targetStepId, "disabled");
await this.navigateToStep(targetStepId, "previous", { pushToHistory: false, popHistory: steps });
```
The guard/not-found throws now happen on the unmodified `stepHistory`, so a thrown
error also leaves history intact (a secondary improvement — previously a disabled
target threw *after* the pop, corrupting history on that path too).

biome note: `popHistory?: number` is fine; no `void`-in-union issue here.

### Failing test (add to existing veto describe block)

File: `packages/core/tests/plugins.test.ts`, inside
`describe("WizardMachine before/afterTransition", ...)`, alongside the existing
`"beforeTransition returning false silently cancels..."` test.

```ts
it("beforeTransition veto on goPrevious leaves stepHistory and current step unchanged", async () => {
  // Allow forward moves, veto only backward ("previous") transitions.
  const m = new WizardMachine<SimpleData>(
    createSimpleLinearDefinition(),
    {},
    initial,
    {},
    [{ name: "p", beforeTransition: (e) => e.type !== "previous" }],
  );
  await flush();

  await m.goNext(); // step1 -> step2
  await m.goNext(); // step2 -> step3
  expect(m.snapshot.currentStepId).toBe("step3");
  const historyBefore = m.history; // ["step1","step2","step3"]
  expect(historyBefore).toEqual(["step1", "step2", "step3"]);

  await m.goPrevious(); // vetoed

  expect(m.snapshot.currentStepId).toBe("step3"); // unchanged
  expect(m.history).toEqual(historyBefore);       // history NOT popped
  expect(m.snapshot.stepStatuses.step3).toBe("active"); // not flipped to "visited"
});

it("beforeTransition veto on goBack leaves stepHistory unchanged", async () => {
  const m = new WizardMachine<SimpleData>(
    createSimpleLinearDefinition(),
    {},
    initial,
    {},
    [{ name: "p", beforeTransition: (e) => e.type !== "previous" }],
  );
  await flush();

  await m.goNext();
  await m.goNext();
  const historyBefore = m.history;
  expect(historyBefore).toEqual(["step1", "step2", "step3"]);

  await m.goBack(2); // vetoed

  expect(m.snapshot.currentStepId).toBe("step3");
  expect(m.history).toEqual(historyBefore); // both pops NOT applied
});
```

Imports/fixtures (`WizardMachine`, `createSimpleLinearDefinition`, `SimpleData`,
`flush`, `initial`) already exist at the top of `plugins.test.ts`. These tests FAIL
on current code (`m.history` would be `["step1","step2"]` / `["step1"]`) and PASS
after the fix.

Verification reminder: this is a core change. Run `pnpm -w run test` (turbo
`^build`) or rebuild core before any framework tests, and run a forced
`tsc --build --force` for the type check (vitest does not typecheck).

---

## Finding 2 — React plugin teardown breaks under React 18 StrictMode

### Verdict: REAL (Medium) — with one important nuance about React 19

`destroy()` is permanent and unrecoverable, and both React entry points destroy the
single retained manager in effect cleanup. Under StrictMode's dev-mode
mount→unmount→remount probe, the cleanup runs against the manager that is reused on
remount, so the surviving component holds a destroyed manager.

NOTE: this repo's React peer dep is `^19.2.0` (see `packages/react/package.json`).
StrictMode's double-invoke of effects also exists in React 18 and 19. The finding's
mechanism is real for both; the test below uses `<StrictMode>` to force the probe.

### Evidence — destroy() is terminal

- `WizardStateManager.destroy()` (packages/state/src/manager.ts ~355) just
  `await this.machine.destroy()`.
- `WizardMachine.destroy()` (wizard-machine.ts ~320) just
  `await this.pluginHost.destroyAll()`.
- `PluginHost.destroyAll()` (packages/core/src/plugins/plugin-host.ts ~162-166)
  sets `this.destroyed = true` and runs every plugin's `destroy()` in reverse.
  Once `destroyed`, `add()` throws `WizardConfigurationError` ("Cannot add plugin
  ... after the wizard has been destroyed"). Plugin `onInit` already fired and will
  not re-fire; plugin instances have run their `destroy()`.

So after destroy: the manager/machine object still exists (refs are preserved by
React across the StrictMode probe), navigation still technically runs, but **all
plugins are torn down** — `beforeTransition`/`afterTransition`/`onStateChange`
plugin hooks no longer fire, and any attempt to `use()` a new plugin throws. The
manager is a zombie.

### Evidence — both entry points destroy the singleton

`use-wizard.tsx` (~265-280): manager created once via `useState(() =>
createManager(...))`; cleanup:
```ts
useEffect(() => {
  return () => {
    void manager.destroy();
  };
}, [manager]);
```

`wizard-provider.tsx` (~145-160): manager created once via `managerRef`; cleanup:
```ts
useEffect(() => {
  const manager = managerRef.current;
  return () => {
    void manager?.destroy();
  };
}, []);
```

StrictMode sequence: mount (create manager, run effect) → unmount probe (run
cleanup → `manager.destroy()`, manager now `destroyed`) → remount (effect runs
again, but `useState`/`managerRef` return the SAME destroyed manager; nothing
recreates it). Component stays mounted with a dead manager.

(Existing test `"calls plugin destroy on unmount"` in
`packages/react/tests/plugins.test.tsx` uses plain `render`/`unmount`, no
StrictMode, so it does not catch this.)

### Recommended fix: option (a) — recreate the manager if it was destroyed on remount

Guarding destroy (option b) is fragile: it would require a heuristic to tell a
StrictMode probe from a real unmount (React gives no such signal), and could leak
managers/plugins in production if the heuristic is wrong. Recreating on remount is
the idiomatic React pattern for "my resource was torn down by the StrictMode probe"
and keeps real-unmount teardown intact. It requires a cheap `isDestroyed` accessor
on the manager (avoids relying on the thrown-on-`add` behaviour).

**Edit A — expose a read-only destroyed flag on the chain (so React can detect a
dead manager).** Minimal: add a getter to `PluginHost`, surface it on
`WizardMachine`, surface it on `WizardStateManager`.

`packages/core/src/plugins/plugin-host.ts` — add:
```ts
get isDestroyed(): boolean {
  return this.destroyed;
}
```
`packages/core/src/machine/wizard-machine.ts` — add a getter near `isBusy`:
```ts
get isDestroyed(): boolean {
  return this.pluginHost.isDestroyed;
}
```
`packages/state/src/manager.ts` — add:
```ts
get isDestroyed(): boolean {
  return this.machine.isDestroyed;
}
```

**Edit B — `use-wizard.tsx`: recreate on remount if destroyed.**

Before:
```ts
const [manager] = useState<WizardStateManager<T>>(() =>
  createManager(initialDataRef.current),
);

useEffect(() => {
  return () => {
    void manager.destroy();
  };
}, [manager]);
```
After:
```ts
const [managerState, setManagerState] = useState<WizardStateManager<T>>(() =>
  createManager(initialDataRef.current),
);
// If the StrictMode probe destroyed the manager, recreate it on remount.
const manager = managerState.isDestroyed
  ? createManager(initialDataRef.current)
  : managerState;
if (manager !== managerState) {
  setManagerState(manager); // re-render with the live manager; subscriptions rebind
}

useEffect(() => {
  return () => {
    void manager.destroy();
  };
}, [manager]);
```
The `useSyncExternalStore` subscriptions are keyed on `[manager]`, so swapping the
manager rebinds them to the live instance. The `useEffect` cleanup dep `[manager]`
re-registers teardown for the new manager.

(Alternative, even more idiomatic: keep `useState` but recreate inside a
render-phase check and call `setManagerState`. The above is that pattern. Avoid
recreating unconditionally — that breaks the "created once" guarantee in production
where `isDestroyed` is always false on remount because there is no probe.)

**Edit C — `wizard-provider.tsx`: same recreate-on-dead-ref guard.**

Before:
```ts
const managerRef = useRef<WizardStateManager<T> | null>(null);

if (!managerRef.current) {
  const events = { ... };
  const machine = new WizardMachine(...);
  managerRef.current = new WizardStateManager(machine, definitionRef.current.initialStepId);
  previousStateRef.current = machine.snapshot;
}

useEffect(() => {
  const manager = managerRef.current;
  return () => {
    void manager?.destroy();
  };
}, []);
```
After — change the create condition to also recreate when the existing ref is
destroyed, and make the cleanup effect depend on the current manager so it
re-registers after a recreate:
```ts
const managerRef = useRef<WizardStateManager<T> | null>(null);

if (!managerRef.current || managerRef.current.isDestroyed) {
  const events = { ... };               // unchanged body
  const machine = new WizardMachine(...);
  managerRef.current = new WizardStateManager(machine, definitionRef.current.initialStepId);
  previousStateRef.current = machine.snapshot;
}

const manager = managerRef.current;
const ctxValue = useMemo(
  () => ({ manager, initialData: initialDataRef.current }),
  [manager],
);

useEffect(() => {
  return () => {
    void manager.destroy();
  };
}, [manager]);
```
Adjust the existing context value/`useMemo` (already present in the provider) to key
on `manager` so consumers rebind after a recreate. In production (no probe)
`isDestroyed` is never true on a live ref, so the manager is still created exactly
once.

biome note: keep `void manager.destroy();` — that is `void` on a statement, not
`void` in a type union, so `noConfusingVoidType` does not apply.

### Failing test

File: `packages/react/tests/plugins.test.tsx` (append to the existing
`describe("React plugins option", ...)`). Imports `StrictMode` from `react`; reuses
the existing `def`, `useWizard`, `WizardProvider`, `render`.

```ts
import { StrictMode } from "react";
import { act } from "@testing-library/react";

it("survives StrictMode double-invoke: manager stays alive and plugins still fire (useWizard)", async () => {
  const beforeTransition = vi.fn(() => true);
  const plugins: WizardPlugin<D>[] = [{ name: "p", beforeTransition }];
  let api: ReturnType<typeof useWizard<D>> | null = null;
  const Comp = () => {
    api = useWizard<D>({ definition: def, initialData: { name: "" }, plugins });
    return <div>ok</div>;
  };
  render(
    <StrictMode>
      <Comp />
    </StrictMode>,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  // After the StrictMode mount->unmount->remount probe the manager must be live:
  // navigation succeeds AND the plugin's beforeTransition still fires.
  await act(async () => {
    await api!.navigation.goNext();
  });

  expect(beforeTransition).toHaveBeenCalled();              // plugin hook still wired
  expect(api!.state.currentStepId).toBe("step2");           // navigation worked
});

it("survives StrictMode double-invoke (WizardProvider)", async () => {
  const beforeTransition = vi.fn(() => true);
  const plugins: WizardPlugin<D>[] = [{ name: "p", beforeTransition }];
  let api: ReturnType<typeof useWizardFromContext> | null = null; // see note
  // Use a child that reads the provider's manager via the granular hook(s).
  // Simplest: assert plugin still fires by navigating through the manager.
  const Child = () => {
    // pull the same context the provider exposes; navigate to exercise beforeTransition
    return <div>child</div>;
  };
  const { rerender } = render(
    <StrictMode>
      <WizardProvider definition={def} initialData={{ name: "" }} plugins={plugins}>
        <Child />
      </WizardProvider>
    </StrictMode>,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  // After the probe, onInit must have fired exactly once on a LIVE manager and the
  // manager must not be destroyed. The cleanest assertion is that a subsequent
  // navigation (via a granular action hook in Child) still triggers beforeTransition.
  // Implement Child using the provider's action hook to call goNext, then:
  // expect(beforeTransition).toHaveBeenCalled();
});
```

The `useWizard` test is fully concrete and is the load-bearing one — it FAILS on
current code (after the probe the manager is destroyed, so `beforeTransition` is
never called and `currentStepId` stays `"step1"`) and PASSES after Edit A+B. For the
provider test, finalize `Child` against whatever granular action hook the provider
exposes (e.g. `useWizardActions`/`useWizardNavigation`) — confirm the exact hook
name in `packages/react/src/hooks` before writing the assertion; the mechanism and
assertions mirror the `useWizard` case.

Verification reminder: Edits A touch core/state. Rebuild (`pnpm -w run test` /
turbo `^build`) before running the React tests, since the React package resolves
`@gooonzick/wizard-core` and `@gooonzick/wizard-state` to built `dist/`. Run a
forced `tsc --build --force` to confirm the new getters typecheck.

---

## Summary of verdicts

- Finding 1 (veto too late for backward nav): **REAL / High.** `goPrevious` and
  `goBack` mutate `stepHistory` (and `goPrevious` flips status) before the
  `beforeTransition` veto inside `navigateToStep`; a veto leaves history/status
  corrupted with no rollback. Forward nav is safe because its only history mutation
  is post-veto. Fix: move the pop into `navigateToStep` (post-veto) via a
  `popHistory` option; compute targets without mutating in the callers.
- Finding 2 (StrictMode teardown): **REAL / Medium.** `destroy()` is terminal
  (`PluginHost.destroyed = true`, plugins torn down). Both React entries destroy the
  single retained manager in cleanup; the StrictMode probe kills the manager that is
  reused on remount → zombie manager. Fix: expose `isDestroyed` and recreate the
  manager on remount when it was destroyed.
