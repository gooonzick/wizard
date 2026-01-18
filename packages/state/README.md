# @gooonzick/wizard-state

A state management layer for multi-step wizards. Provides fine-grained subscription channels for efficient React component rendering when using `useSyncExternalStore`.

## Overview

`WizardStateManager` wraps a `WizardMachine` instance and adds a subscription-based state notification system. This enables React hooks to subscribe to specific state channels (state, navigation, validation, loading) for selective re-renders, avoiding unnecessary updates.

## Installation

```bash
pnpm add @gooonzick/wizard-state @gooonzick/wizard-core
```

## Basic Usage

```typescript
import { WizardMachine } from "@gooonzick/wizard-core";
import { WizardStateManager } from "@gooonzick/wizard-state";

// Create a wizard machine
const machine = new WizardMachine(wizardDefinition, context, initialData);

// Wrap it with the state manager
const manager = new WizardStateManager(machine, "step-1");

// Subscribe to state changes
const unsubscribe = manager.subscribe(() => {
	console.log("State changed");
});

// Subscribe to specific channel
const navUnsubscribe = manager.subscribe(
	() => {
		console.log("Navigation state changed");
	},
	"navigation"
);

// Handle machine state changes
manager.handleStateChange(newState, oldState);

// Clean up
unsubscribe();
navUnsubscribe();
```

## API

### Constructor

```typescript
new WizardStateManager<T extends WizardData>(
	machine: WizardMachine<T>,
	initialStepId: StepId
)
```

Creates a state manager wrapping the provided machine.

### Subscription Methods

#### `subscribe(listener, channel?)`

Subscribes to state changes on a specific channel or all channels.

```typescript
// Subscribe to all channels (default)
const unsub = manager.subscribe(() => console.log("Any change"));

// Subscribe to specific channel
const navUnsub = manager.subscribe(
	() => console.log("Navigation changed"),
	"navigation"
);
```

**Channels:**

- `"state"` - Data or current step changes
- `"navigation"` - Navigation capabilities (canGoNext, canGoPrevious)
- `"validation"` - Validation state or errors
- `"loading"` - Loading flags (isValidating, isSubmitting, isNavigating)
- `"all"` - All channels (default)

### Snapshot Methods

#### `getStateSnapshot()`

Returns cached state snapshot for the current step and data.

```typescript
const snapshot = manager.getStateSnapshot();
console.log(snapshot.currentStepId, snapshot.data);
```

#### `getNavigationSnapshot()`

Returns cached navigation state (async-computed).

```typescript
const navSnap = manager.getNavigationSnapshot();
console.log(navSnap.canGoNext, navSnap.canGoPrevious);
```

#### `getValidationSnapshot()`

Returns cached validation state.

```typescript
const validSnap = manager.getValidationSnapshot();
console.log(validSnap.isValid, validSnap.validationErrors);
```

#### `getLoadingSnapshot()`

Returns cached loading state.

```typescript
const loadingSnap = manager.getLoadingSnapshot();
console.log(loadingSnap.isValidating, loadingSnap.isSubmitting);
```

### State Management

#### `handleStateChange(newState, oldState)`

Called when the machine state changes. Automatically determines which channels to notify based on what actually changed.

```typescript
machine.subscribe((newState, oldState) => {
	manager.handleStateChange(newState, oldState);
});
```

#### `setLoadingState(update)`

Updates loading state and notifies loading channel subscribers.

```typescript
manager.setLoadingState({ isValidating: true });
```

### Notification

#### `notifySubscribers(channels)`

Manually notify subscribers of specific channels.

```typescript
manager.notifySubscribers(["state", "navigation"]);
```

### Machine Access

#### `getMachine()`

Get direct access to the underlying machine.

```typescript
const machine = manager.getMachine();
```

#### `getCurrentStep()`

Get the current step definition.

```typescript
const step = manager.getCurrentStep();
```

#### `getVisitedSteps()`

Get list of visited step IDs.

```typescript
const visited = manager.getVisitedSteps();
```

#### `getStepHistory()`

Get ordered history of step navigation.

```typescript
const history = manager.getStepHistory();
```

## Design Philosophy

- **Cached Snapshots** - All snapshot getters return the same reference until the underlying data actually changes, enabling `useSyncExternalStore` stability
- **Channel-Based Subscriptions** - Listeners only receive notifications for the specific channels they care about, reducing unnecessary React renders
- **Async Navigation** - Navigation capabilities are computed asynchronously in the background to avoid blocking renders

## See Also

- [@gooonzick/wizard-core](../core) - Core state machine
- [@gooonzick/wizard-react](../react) - React hooks using WizardStateManager
