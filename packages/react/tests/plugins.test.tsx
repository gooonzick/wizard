import type { WizardPlugin } from "@gooonzick/wizard-core";
import { createLinearWizard } from "@gooonzick/wizard-core";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWizard } from "../src/use-wizard";
import { WizardProvider } from "../src/wizard-provider";

interface D extends Record<string, unknown> {
	name: string;
}

const def = createLinearWizard<D>({
	id: "t",
	steps: [
		{ id: "step1", title: "Step 1" },
		{ id: "step2", title: "Step 2" },
	],
});

describe("React plugins option", () => {
	it("threads plugins into the machine (onInit fires) via useWizard", async () => {
		const onInit = vi.fn();
		const plugins: WizardPlugin<D>[] = [{ name: "p", onInit }];
		const Comp = () => {
			useWizard<D>({ definition: def, initialData: { name: "" }, plugins });
			return <div>ok</div>;
		};
		render(<Comp />);
		await new Promise((r) => setTimeout(r, 0));
		expect(onInit).toHaveBeenCalledTimes(1);
	});

	it("calls plugin destroy on unmount (useWizard)", async () => {
		const destroy = vi.fn();
		const plugins: WizardPlugin<D>[] = [{ name: "p", destroy }];
		const Comp = () => {
			useWizard<D>({ definition: def, initialData: { name: "" }, plugins });
			return <div>ok</div>;
		};
		const { unmount } = render(<Comp />);
		unmount();
		await new Promise((r) => setTimeout(r, 0));
		expect(destroy).toHaveBeenCalledTimes(1);
	});

	it("calls plugin destroy on unmount (WizardProvider)", async () => {
		const destroy = vi.fn();
		const plugins: WizardPlugin<D>[] = [{ name: "p", destroy }];
		const { unmount } = render(
			<WizardProvider
				definition={def}
				initialData={{ name: "" }}
				plugins={plugins}
			>
				<div>child</div>
			</WizardProvider>,
		);
		unmount();
		await new Promise((r) => setTimeout(r, 0));
		expect(destroy).toHaveBeenCalledTimes(1);
	});
});
