import { describe, expect, it, vi } from "vitest";
import { WizardMachine } from "../src/machine/wizard-machine";
import type { WizardPlugin } from "../src/plugins/types";
import { createSimpleLinearDefinition, type SimpleData } from "./fixtures";

const flush = () => new Promise((r) => setTimeout(r, 0));
const initial: SimpleData = { name: "a", email: "a@x.io" };

type Events = ConstructorParameters<typeof WizardMachine<SimpleData>>[3];

/**
 * Builds a machine whose onStateChange throws `boom` once `arm()` is called.
 * Arming after the async first-step initialization keeps construction clean so
 * the test isolates the operation under test.
 */
async function makeArmedMachine(
	boom: Error,
	events: Events = {},
	plugins?: WizardPlugin<SimpleData>[],
) {
	let armed = false;
	const onStateChange = vi.fn(() => {
		if (armed) throw boom;
	});
	const m = new WizardMachine<SimpleData>(
		createSimpleLinearDefinition(),
		{},
		initial,
		{ ...events, onStateChange },
		plugins,
	);
	await flush();
	return {
		m,
		onStateChange,
		arm: () => {
			armed = true;
		},
	};
}

describe("onStateChange subscriber isolation", () => {
	it("a throwing onStateChange does not reject goNext(); the step still advances and onError is called", async () => {
		const boom = new Error("state boom");
		const onError = vi.fn();
		const onStepEnter = vi.fn();
		const { m, onStateChange, arm } = await makeArmedMachine(boom, {
			onError,
			onStepEnter,
		});
		onStepEnter.mockClear();
		arm();

		await expect(m.goNext()).resolves.toBeUndefined();

		expect(onStateChange).toHaveBeenCalled();
		expect(onStepEnter).toHaveBeenCalledWith("step2", expect.anything());
		expect(m.snapshot.currentStepId).toBe("step2");
		expect(onError).toHaveBeenCalledWith(boom);
	});

	it("a throwing onStateChange does not throw from updateField; onDataChange still fires and onError is called", async () => {
		const boom = new Error("state boom");
		const onError = vi.fn();
		const onDataChange = vi.fn();
		const { m, arm } = await makeArmedMachine(boom, { onError, onDataChange });
		arm();

		expect(() => m.updateField("name", "b")).not.toThrow();

		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onDataChange.mock.calls[0][2]).toEqual(["name"]);
		expect(onError).toHaveBeenCalledWith(boom);
		expect(m.snapshot.data.name).toBe("b");
	});

	it("routes onStateChange throws to plugin onError with phase 'state'", async () => {
		const boom = new Error("state boom");
		const pluginOnError = vi.fn();
		const { m, arm } = await makeArmedMachine(boom, {}, [
			{ name: "p", onError: pluginOnError },
		]);
		arm();

		m.updateField("name", "x");
		await flush();

		expect(pluginOnError).toHaveBeenCalledTimes(1);
		const [err, ctx] = pluginOnError.mock.calls[0];
		expect(err).toBe(boom);
		expect(ctx).toMatchObject({ phase: "state" });
	});
});
