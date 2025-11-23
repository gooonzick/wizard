import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it, vi } from "vitest";
import { WizardValidationError } from "../src/errors";
import { createStandardSchemaValidator } from "../src/machine/validators";
import {
	type WizardEvents,
	WizardMachine,
} from "../src/machine/wizard-machine";
import type { WizardDefinition } from "../src/types/definition";

interface TestWizardData extends Record<string, unknown> {
	name?: string;
	allowMiddle: boolean;
	allowRestricted: boolean;
}

const defaultContext = {};

function createMachine(
	definition: WizardDefinition<TestWizardData>,
	overrides: Partial<TestWizardData> = {},
	events?: WizardEvents<TestWizardData>,
): WizardMachine<TestWizardData> {
	const initialData: TestWizardData = {
		name: "Ada",
		allowMiddle: true,
		allowRestricted: true,
		...overrides,
	};

	return new WizardMachine(definition, defaultContext, initialData, events);
}

describe("WizardMachine", () => {
	it("goNext skips disabled steps and tracks visited history", async () => {
		const startLeave = vi.fn();
		const finalEnter = vi.fn();
		const events: WizardEvents<TestWizardData> = {
			onStateChange: vi.fn(),
			onStepEnter: vi.fn(),
			onStepLeave: vi.fn(),
		};

		const definition: WizardDefinition<TestWizardData> = {
			id: "test",
			initialStepId: "start",
			steps: {
				start: {
					id: "start",
					next: { type: "static", to: "middle" },
					onLeave: startLeave,
				},
				middle: {
					id: "middle",
					enabled: (data) => data.allowMiddle,
					next: { type: "static", to: "final" },
				},
				final: {
					id: "final",
					onEnter: finalEnter,
				},
			},
		};

		const machine = createMachine(definition, { allowMiddle: false }, events);

		await machine.goNext();

		expect(machine.snapshot.currentStepId).toBe("final");
		expect(machine.visited).toEqual(["start", "final"]);
		expect(startLeave).toHaveBeenCalledTimes(1);
		expect(finalEnter).toHaveBeenCalledTimes(1);
		expect(events.onStepLeave).toHaveBeenCalledWith(
			"start",
			expect.objectContaining({ allowMiddle: false }),
		);
		expect(events.onStepEnter).toHaveBeenCalledWith(
			"final",
			expect.objectContaining({ allowMiddle: false }),
		);
		expect(events.onStateChange).toHaveBeenCalled();
	});

	it("stops navigation when validation fails and surfaces errors", async () => {
		const validator = vi.fn().mockResolvedValue({
			valid: false,
			errors: { name: "Name is required" },
		});
		const events: WizardEvents<TestWizardData> = {
			onValidation: vi.fn(),
		};

		const definition: WizardDefinition<TestWizardData> = {
			id: "test",
			initialStepId: "start",
			steps: {
				start: {
					id: "start",
					next: { type: "static", to: "middle" },
					validate: validator,
				},
				middle: {
					id: "middle",
				},
			},
		};

		const machine = createMachine(definition, { name: undefined }, events);

		await expect(machine.goNext()).rejects.toThrow(WizardValidationError);
		expect(validator).toHaveBeenCalledTimes(1);
		expect(machine.snapshot.isValid).toBe(false);
		expect(machine.snapshot.validationErrors).toEqual({
			name: "Name is required",
		});
		expect(events.onValidation).toHaveBeenCalledWith({
			valid: false,
			errors: { name: "Name is required" },
		});
	});

	it("enforces guards when jumping to steps and completes on submit", async () => {
		const submitSpy = vi.fn();
		const definitionComplete = vi.fn();
		const onCompleteSpy = vi.fn();
		const onErrorSpy = vi.fn();
		const events: WizardEvents<TestWizardData> = {
			onComplete: onCompleteSpy,
			onError: onErrorSpy,
		};

		const definition: WizardDefinition<TestWizardData> = {
			id: "test",
			initialStepId: "start",
			steps: {
				start: {
					id: "start",
					next: { type: "static", to: "restricted" },
				},
				restricted: {
					id: "restricted",
					enabled: (data) => data.allowRestricted,
					next: { type: "static", to: "final" },
				},
				final: {
					id: "final",
					onSubmit: submitSpy,
				},
			},
			onComplete: definitionComplete,
		};

		const machine = createMachine(
			definition,
			{ allowRestricted: false },
			events,
		);

		await expect(machine.goToStep("restricted")).rejects.toThrow("not enabled");
		expect(onErrorSpy).toHaveBeenCalledTimes(1);

		machine.updateData((data) => ({ ...data, allowRestricted: true }));

		await machine.goToStep("restricted");
		await machine.goNext();
		await machine.submit();

		expect(submitSpy).toHaveBeenCalledTimes(1);
		expect(definitionComplete).toHaveBeenCalledTimes(1);
		expect(onCompleteSpy).toHaveBeenCalledWith(
			expect.objectContaining({ allowRestricted: true }),
		);
		expect(onErrorSpy).toHaveBeenCalledTimes(1);
	});

	it("supports Standard Schema validators", async () => {
		const schema: StandardSchemaV1<TestWizardData> = {
			"~standard": {
				version: 1,
				vendor: "unit-test",
				validate: (value) => {
					const data = value as TestWizardData;
					if (!data.name || data.name.length < 3) {
						return {
							issues: [
								{
									message: "Name too short",
									path: ["name"],
								},
							],
						};
					}
					return { value: data };
				},
			},
		};

		const definition: WizardDefinition<TestWizardData> = {
			id: "schema-test",
			initialStepId: "start",
			steps: {
				start: {
					id: "start",
					next: { type: "static", to: "end" },
					validate: createStandardSchemaValidator(schema),
				},
				end: { id: "end" },
			},
		};

		const machine = createMachine(definition, { name: "Al" });
		await expect(machine.goNext()).rejects.toThrow(WizardValidationError);
		expect(machine.snapshot.validationErrors).toEqual({
			name: "Name too short",
		});

		machine.updateData((prev) => ({ ...prev, name: "Alice" }));

		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("end");
	});
});
