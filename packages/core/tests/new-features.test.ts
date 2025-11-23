import { describe, expect, it, vi } from "vitest";
import {
	WizardAbortError,
	WizardConfigurationError,
	WizardNavigationError,
	WizardValidationError,
} from "../src/errors";
import { requiredFields } from "../src/machine/validators";
import { WizardMachine } from "../src/machine/wizard-machine";
import type { WizardDefinition } from "../src/types/definition";

interface TestData extends Record<string, unknown> {
	name: string;
	email: string;
	age: number;
	enabled: boolean;
}

const defaultContext = {};

function createTestDefinition(
	overrides?: Partial<WizardDefinition<TestData>>,
): WizardDefinition<TestData> {
	return {
		id: "test-wizard",
		initialStepId: "step1",
		steps: {
			step1: {
				id: "step1",
				next: { type: "static", to: "step2" },
			},
			step2: {
				id: "step2",
				previous: { type: "static", to: "step1" },
				next: { type: "static", to: "step3" },
			},
			step3: {
				id: "step3",
				previous: { type: "static", to: "step2" },
			},
		},
		...overrides,
	};
}

const defaultData: TestData = {
	name: "",
	email: "",
	age: 0,
	enabled: true,
};

describe("WizardMachine - New Features", () => {
	describe("Initial Step onStepEnter", () => {
		it("should call onEnter lifecycle hook for initial step", async () => {
			const onEnter = vi.fn();
			const onStepEnterEvent = vi.fn();

			const definition: WizardDefinition<TestData> = {
				...createTestDefinition(),
				steps: {
					...createTestDefinition().steps,
					step1: {
						id: "step1",
						next: { type: "static", to: "step2" },
						onEnter,
					},
				},
			};

			new WizardMachine(definition, defaultContext, defaultData, {
				onStepEnter: onStepEnterEvent,
			});

			// Wait for async initialization
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(onEnter).toHaveBeenCalledTimes(1);
			expect(onStepEnterEvent).toHaveBeenCalledWith(
				"step1",
				expect.any(Object),
			);
		});
	});

	describe("Navigation Lock (Race Condition Prevention)", () => {
		it("should throw error when navigation is already in progress", async () => {
			const definition: WizardDefinition<TestData> = {
				...createTestDefinition(),
				steps: {
					step1: {
						id: "step1",
						next: { type: "static", to: "step2" },
						onLeave: async () => {
							await new Promise((resolve) => setTimeout(resolve, 100));
						},
					},
					step2: { id: "step2" },
				},
			};

			const machine = new WizardMachine(
				definition,
				defaultContext,
				defaultData,
			);

			// Start first navigation (don't await)
			const firstNav = machine.goNext();

			// Wait a tick for the first navigation to start
			await new Promise((resolve) => setTimeout(resolve, 0));

			// Second navigation should fail because first is in progress
			await expect(machine.goNext()).rejects.toThrow(
				"Navigation already in progress",
			);

			// First navigation should complete
			await firstNav;
			expect(machine.snapshot.currentStepId).toBe("step2");
		});

		it("should expose isBusy property", async () => {
			const definition: WizardDefinition<TestData> = {
				...createTestDefinition(),
				steps: {
					step1: {
						id: "step1",
						next: { type: "static", to: "step2" },
						onLeave: async () => {
							await new Promise((resolve) => setTimeout(resolve, 50));
						},
					},
					step2: { id: "step2" },
				},
			};

			const machine = new WizardMachine(
				definition,
				defaultContext,
				defaultData,
			);

			expect(machine.isBusy).toBe(false);

			const navPromise = machine.goNext();
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(machine.isBusy).toBe(true);

			await navPromise;
			expect(machine.isBusy).toBe(false);
		});
	});

	describe("Circular Dependency Protection", () => {
		it("should detect and throw on circular step dependencies", async () => {
			const definition: WizardDefinition<TestData> = {
				id: "circular-test",
				initialStepId: "a",
				steps: {
					a: {
						id: "a",
						next: { type: "static", to: "b" },
						enabled: false,
					},
					b: {
						id: "b",
						next: { type: "static", to: "c" },
						enabled: false,
					},
					c: {
						id: "c",
						next: { type: "static", to: "a" }, // Circular!
						enabled: false,
					},
					start: {
						id: "start",
						next: { type: "static", to: "a" },
					},
				},
			};

			const machine = new WizardMachine(
				{ ...definition, initialStepId: "start" },
				defaultContext,
				defaultData,
			);

			await expect(machine.goNext()).rejects.toThrow(
				"Circular step dependency",
			);
		});
	});

	describe("isCompleted State", () => {
		it("should set isCompleted to true after wizard completion", async () => {
			const onComplete = vi.fn();

			const definition: WizardDefinition<TestData> = {
				id: "complete-test",
				initialStepId: "step1",
				steps: {
					step1: { id: "step1" }, // No next step
				},
				onComplete,
			};

			const machine = new WizardMachine(
				definition,
				defaultContext,
				defaultData,
			);

			expect(machine.snapshot.isCompleted).toBe(false);

			await machine.goNext();

			expect(machine.snapshot.isCompleted).toBe(true);
			expect(onComplete).toHaveBeenCalledTimes(1);
		});

		it("should prevent duplicate onComplete calls", async () => {
			const onComplete = vi.fn();

			const definition: WizardDefinition<TestData> = {
				id: "no-duplicate-test",
				initialStepId: "step1",
				steps: {
					step1: { id: "step1" },
				},
				onComplete,
			};

			const machine = new WizardMachine(
				definition,
				defaultContext,
				defaultData,
			);

			await machine.goNext();
			await expect(machine.goNext()).rejects.toThrow("already completed");

			expect(onComplete).toHaveBeenCalledTimes(1);
		});
	});

	describe("canSubmit Method", () => {
		it("should return true when valid and on last step", async () => {
			const definition: WizardDefinition<TestData> = {
				id: "can-submit-test",
				initialStepId: "step1",
				steps: {
					step1: { id: "step1" },
				},
			};

			const machine = new WizardMachine(
				definition,
				defaultContext,
				defaultData,
			);
			const result = await machine.canSubmit();

			expect(result).toBe(true);
		});

		it("should return false when validation fails", async () => {
			const definition: WizardDefinition<TestData> = {
				id: "can-submit-invalid-test",
				initialStepId: "step1",
				steps: {
					step1: {
						id: "step1",
						validate: () => ({ valid: false, errors: { name: "Required" } }),
					},
				},
			};

			const machine = new WizardMachine(
				definition,
				defaultContext,
				defaultData,
			);
			const result = await machine.canSubmit();

			expect(result).toBe(false);
		});

		it("should return false when wizard is already completed", async () => {
			const definition: WizardDefinition<TestData> = {
				id: "can-submit-completed-test",
				initialStepId: "step1",
				steps: {
					step1: { id: "step1" },
				},
			};

			const machine = new WizardMachine(
				definition,
				defaultContext,
				defaultData,
			);
			await machine.goNext(); // Complete the wizard

			const result = await machine.canSubmit();
			expect(result).toBe(false);
		});
	});

	describe("goBack Method", () => {
		it("should navigate back through history", async () => {
			const machine = new WizardMachine(
				createTestDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext(); // step1 -> step2
			await machine.goNext(); // step2 -> step3

			expect(machine.snapshot.currentStepId).toBe("step3");
			expect(machine.history).toEqual(["step1", "step2", "step3"]);

			await machine.goBack(2); // Go back 2 steps to step1

			expect(machine.snapshot.currentStepId).toBe("step1");
		});

		it("should throw when going back too many steps", async () => {
			const machine = new WizardMachine(
				createTestDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext(); // step1 -> step2

			await expect(machine.goBack(5)).rejects.toThrow("Cannot go back");
		});

		it("should throw when target step is disabled", async () => {
			const definition: WizardDefinition<TestData> = {
				id: "goback-disabled-test",
				initialStepId: "step1",
				steps: {
					step1: {
						id: "step1",
						next: { type: "static", to: "step2" },
						enabled: (data) => data.enabled,
					},
					step2: {
						id: "step2",
						previous: { type: "static", to: "step1" },
					},
				},
			};

			const machine = new WizardMachine(definition, defaultContext, {
				...defaultData,
				enabled: true,
			});
			await machine.goNext();

			// Now disable step1
			machine.updateData((d) => ({ ...d, enabled: false }));

			await expect(machine.goBack()).rejects.toThrow("no longer enabled");
		});
	});

	describe("Step History", () => {
		it("should track navigation history", async () => {
			const machine = new WizardMachine(
				createTestDefinition(),
				defaultContext,
				defaultData,
			);

			expect(machine.history).toEqual(["step1"]);

			await machine.goNext();
			expect(machine.history).toEqual(["step1", "step2"]);

			await machine.goNext();
			expect(machine.history).toEqual(["step1", "step2", "step3"]);

			await machine.goPrevious();
			expect(machine.history).toEqual(["step1", "step2", "step3", "step2"]);
		});
	});

	describe("Public Step Resolution Methods", () => {
		it("should expose getNextStepId", async () => {
			const machine = new WizardMachine(
				createTestDefinition(),
				defaultContext,
				defaultData,
			);

			const nextId = await machine.getNextStepId();
			expect(nextId).toBe("step2");
		});

		it("should expose getPreviousStepId", async () => {
			const machine = new WizardMachine(
				createTestDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext();
			const prevId = await machine.getPreviousStepId();
			expect(prevId).toBe("step1");
		});
	});

	describe("AbortSignal Support", () => {
		it("should throw WizardAbortError when signal is aborted", async () => {
			const controller = new AbortController();
			const context = { signal: controller.signal };

			const machine = new WizardMachine(
				createTestDefinition(),
				context,
				defaultData,
			);

			controller.abort();

			await expect(machine.goNext()).rejects.toThrow(WizardAbortError);
		});

		it("should throw on validate when aborted", async () => {
			const controller = new AbortController();
			const context = { signal: controller.signal };

			const machine = new WizardMachine(
				createTestDefinition(),
				context,
				defaultData,
			);

			controller.abort();

			await expect(machine.validate()).rejects.toThrow(WizardAbortError);
		});
	});

	describe("Debug Mode", () => {
		it("should log debug messages when debug is enabled", async () => {
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

			const machine = new WizardMachine(
				createTestDefinition(),
				{ debug: true },
				defaultData,
			);

			await new Promise((resolve) => setTimeout(resolve, 10));
			await machine.goNext();

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[WizardMachine]"),
			);

			consoleSpy.mockRestore();
		});
	});

	describe("Custom Error Types", () => {
		it("should throw WizardValidationError on validation failure", async () => {
			const definition: WizardDefinition<TestData> = {
				...createTestDefinition(),
				steps: {
					step1: {
						id: "step1",
						next: { type: "static", to: "step2" },
						validate: () => ({
							valid: false,
							errors: { name: "Name is required" },
						}),
					},
					step2: { id: "step2" },
				},
			};

			const machine = new WizardMachine(
				definition,
				defaultContext,
				defaultData,
			);

			try {
				await machine.goNext();
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(WizardValidationError);
				expect((error as WizardValidationError).errors).toEqual({
					name: "Name is required",
				});
			}
		});

		it("should throw WizardNavigationError with step info", async () => {
			const definition: WizardDefinition<TestData> = {
				...createTestDefinition(),
				steps: {
					step1: {
						id: "step1",
					},
					step2: {
						id: "step2",
						enabled: false,
					},
				},
			};

			const machine = new WizardMachine(
				definition,
				defaultContext,
				defaultData,
			);

			try {
				await machine.goToStep("step2");
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(WizardNavigationError);
				expect((error as WizardNavigationError).stepId).toBe("step2");
				expect((error as WizardNavigationError).reason).toBe("disabled");
			}
		});

		it("should throw WizardConfigurationError for invalid initial step", () => {
			const definition: WizardDefinition<TestData> = {
				id: "invalid-config",
				initialStepId: "nonexistent",
				steps: {
					step1: { id: "step1" },
				},
			};

			expect(() => {
				new WizardMachine(definition, defaultContext, defaultData);
			}).toThrow(WizardConfigurationError);
		});
	});
});

describe("Validators - New Features", () => {
	describe("requiredFields with custom messages", () => {
		it("should use custom error messages", async () => {
			const validator = requiredFields<TestData>("name", "email", {
				messages: {
					name: "Please enter your name",
					email: "Email address is required",
				},
			});

			const result = await validator(
				{ name: "", email: "", age: 0, enabled: true },
				{},
			);

			expect(result.valid).toBe(false);
			expect(result.errors?.name).toBe("Please enter your name");
			expect(result.errors?.email).toBe("Email address is required");
		});

		it("should use default message template", async () => {
			const validator = requiredFields<TestData>("name", "email", {
				defaultMessage: "{field} cannot be empty",
			});

			const result = await validator(
				{ name: "", email: "test@test.com", age: 0, enabled: true },
				{},
			);

			expect(result.valid).toBe(false);
			expect(result.errors?.name).toBe("name cannot be empty");
		});

		it("should work without options (backward compatible)", async () => {
			const validator = requiredFields<TestData>("name", "email");

			const result = await validator(
				{ name: "", email: "", age: 0, enabled: true },
				{},
			);

			expect(result.valid).toBe(false);
			expect(result.errors?.name).toBe("name is required");
			expect(result.errors?.email).toBe("email is required");
		});
	});
});
