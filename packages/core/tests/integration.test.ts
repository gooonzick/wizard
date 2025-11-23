import { describe, expect, test } from "vitest";
import { createWizard } from "../src/builders/create-wizard";
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
});
