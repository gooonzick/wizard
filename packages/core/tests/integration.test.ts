import { describe, expect, test, vi } from "vitest";
import { createWizard } from "../src/builders/create-wizard";
import { WizardValidationError } from "../src/errors";
import type { WizardEvents } from "../src/machine/wizard-machine";
import { WizardMachine } from "../src/machine/wizard-machine";

describe("Complete Wizard Flow", () => {
	test("should complete multi-step wizard with conditions", async () => {
		type FormData = {
			name: string;
			age: number;
			needsHelp: boolean;
			helpDetails?: string;
		};

		const wizard = createWizard<FormData>("integration-test")
			.step("personal", (s) =>
				s
					.title("Personal Info")
					.validate((data: FormData) => ({
						valid: data.name.length > 0 && data.age > 0,
						errors: !data.name ? { name: "Required" } : undefined,
					}))
					.next("preferences"),
			)
			.step("preferences", (s) =>
				s
					.title("Preferences")
					.previous("personal")
					.nextWhen([
						{ when: (d: FormData) => d.needsHelp, to: "help" },
						{ when: () => true, to: "summary" },
					]),
			)
			.step("help", (s) =>
				s
					.title("Help Details")
					.enabled((d: FormData) => d.needsHelp)
					.previous("preferences")
					.next("summary"),
			)
			.step("summary", (s) =>
				s.title("Summary").previous({
					type: "resolver",
					resolve: (data: FormData) =>
						data.needsHelp ? "help" : "preferences",
				}),
			)
			.build();

		const machine = new WizardMachine(
			wizard,
			{},
			{
				name: "",
				age: 0,
				needsHelp: false,
			},
		);

		// Step 1: Personal Info
		machine.updateData((d: FormData) => ({ ...d, name: "John", age: 25 }));
		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("preferences");

		// Step 2: Preferences - with help needed
		machine.updateData((d: FormData) => ({ ...d, needsHelp: true }));
		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("help");

		// Step 3: Help Details
		machine.updateData((d: FormData) => ({
			...d,
			helpDetails: "Need assistance",
		}));
		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("summary");

		// Navigate back
		await machine.goPrevious();
		expect(machine.snapshot.currentStepId).toBe("help");
	});

	test("should complete full wizard lifecycle with onComplete callback", async () => {
		type FormData = {
			name: string;
			age: number;
			needsHelp: boolean;
			helpDetails?: string;
		};

		const onComplete = vi.fn();
		const onStepEnter = vi.fn();
		const onStepLeave = vi.fn();
		const events: WizardEvents<FormData> = {
			onComplete,
			onStepEnter,
			onStepLeave,
		};

		const wizard = createWizard<FormData>("lifecycle-test")
			.step("personal", (s) => s.title("Personal Info").next("summary"))
			.step("summary", (s) => s.title("Summary").previous("personal"))
			.build();

		const machine = new WizardMachine(
			wizard,
			{},
			{ name: "Alice", age: 30, needsHelp: false },
			events,
		);

		expect(onStepEnter).toHaveBeenCalledWith("personal", expect.any(Object));

		await machine.goNext();
		expect(onStepLeave).toHaveBeenCalledWith("personal", expect.any(Object));
		expect(onStepEnter).toHaveBeenCalledWith("summary", expect.any(Object));

		await machine.submit();
		expect(onComplete).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Alice" }),
		);
		expect(machine.snapshot.isCompleted).toBe(true);
	});

	test("should handle validation failure and recovery mid-flow", async () => {
		type FormData = {
			name: string;
			age: number;
			needsHelp: boolean;
			helpDetails?: string;
		};

		const wizard = createWizard<FormData>("validation-recovery")
			.step("personal", (s) =>
				s
					.title("Personal Info")
					.validate((data: FormData) => ({
						valid: data.name.length > 0,
						errors: !data.name ? { name: "Required" } : undefined,
					}))
					.next("done"),
			)
			.step("done", (s) => s.title("Done"))
			.build();

		const machine = new WizardMachine(
			wizard,
			{},
			{ name: "", age: 0, needsHelp: false },
		);

		// Validation fails
		await expect(machine.goNext()).rejects.toThrow(WizardValidationError);
		expect(machine.snapshot.currentStepId).toBe("personal");
		expect(machine.snapshot.isValid).toBe(false);

		// Fix data and retry
		machine.updateData((d) => ({ ...d, name: "Fixed" }));
		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("done");
	});

	test("should navigate backward and re-submit successfully", async () => {
		type FormData = {
			name: string;
			age: number;
			needsHelp: boolean;
			helpDetails?: string;
		};

		const onComplete = vi.fn();

		const wizard = createWizard<FormData>("backward-nav")
			.step("a", (s) => s.title("A").next("b"))
			.step("b", (s) => s.title("B").previous("a").next("c"))
			.step("c", (s) => s.title("C").previous("b"))
			.build();

		const machine = new WizardMachine(
			{ ...wizard, onComplete },
			{},
			{ name: "Test", age: 25, needsHelp: false },
		);

		await machine.goNext(); // a -> b
		await machine.goNext(); // b -> c
		expect(machine.snapshot.currentStepId).toBe("c");

		await machine.goPrevious(); // c -> b
		expect(machine.snapshot.currentStepId).toBe("b");

		await machine.goNext(); // b -> c again
		await machine.submit();

		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	test("should follow conditional branches based on data", async () => {
		type FormData = {
			name: string;
			age: number;
			needsHelp: boolean;
			helpDetails?: string;
		};

		const wizard = createWizard<FormData>("conditional-branches")
			.step("start", (s) =>
				s.title("Start").nextWhen([
					{ when: (d: FormData) => d.needsHelp, to: "help" },
					{ when: () => true, to: "end" },
				]),
			)
			.step("help", (s) =>
				s
					.title("Help")
					.enabled((d: FormData) => d.needsHelp)
					.next("end"),
			)
			.step("end", (s) => s.title("End"))
			.build();

		// Branch A: needsHelp = true goes to help
		const machineA = new WizardMachine(
			wizard,
			{},
			{ name: "A", age: 20, needsHelp: true },
		);
		await machineA.goNext();
		expect(machineA.snapshot.currentStepId).toBe("help");

		// Branch B: needsHelp = false goes to end
		const machineB = new WizardMachine(
			wizard,
			{},
			{ name: "B", age: 20, needsHelp: false },
		);
		await machineB.goNext();
		expect(machineB.snapshot.currentStepId).toBe("end");
	});
});
