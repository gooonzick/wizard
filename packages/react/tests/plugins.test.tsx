import type { WizardPlugin } from "@gooonzick/wizard-core";
import { createLinearWizard } from "@gooonzick/wizard-core";
import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useWizard } from "../src/use-wizard";
import { useWizardNavigation } from "../src/use-wizard-granular";
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

	it("survives StrictMode double-invoke: manager stays alive and plugins still fire (useWizard)", async () => {
		const beforeTransition = vi.fn(() => true);
		const plugins: WizardPlugin<D>[] = [{ name: "p", beforeTransition }];
		const captured: { api: ReturnType<typeof useWizard<D>> | null } = {
			api: null,
		};
		const Comp = () => {
			captured.api = useWizard<D>({
				definition: def,
				initialData: { name: "" },
				plugins,
			});
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
			await captured.api?.navigation.goNext();
		});

		expect(beforeTransition).toHaveBeenCalled(); // plugin hook still wired
		expect(captured.api?.state.currentStepId).toBe("step2"); // navigation worked
	});

	it("StrictMode mount does not leak an orphaned machine (onInit balanced by destroy) — useWizard", async () => {
		let created = 0;
		let destroyed = 0;
		const plugins: WizardPlugin<D>[] = [
			{
				name: "p",
				onInit: () => {
					created++;
				},
				destroy: () => {
					destroyed++;
				},
			},
		];
		const Comp = () => {
			useWizard<D>({ definition: def, initialData: { name: "" }, plugins });
			return <div>ok</div>;
		};
		const { unmount } = render(
			<StrictMode>
				<Comp />
			</StrictMode>,
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});

		// Exactly one live manager after the mount settles; every extra creation
		// (StrictMode probe) was torn down.
		expect(created - destroyed).toBe(1);

		unmount();
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});

		// No leak: every onInit is matched by a destroy.
		expect(created).toBe(destroyed);
	});

	it("StrictMode mount does not leak an orphaned machine (onInit balanced by destroy) — WizardProvider", async () => {
		let created = 0;
		let destroyed = 0;
		const plugins: WizardPlugin<D>[] = [
			{
				name: "p",
				onInit: () => {
					created++;
				},
				destroy: () => {
					destroyed++;
				},
			},
		];
		const { unmount } = render(
			<StrictMode>
				<WizardProvider
					definition={def}
					initialData={{ name: "" }}
					plugins={plugins}
				>
					<div>child</div>
				</WizardProvider>
			</StrictMode>,
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});

		// Exactly one live manager after the mount settles; every extra creation
		// (StrictMode probe) was torn down.
		expect(created - destroyed).toBe(1);

		unmount();
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});

		// No leak: every onInit is matched by a destroy.
		expect(created).toBe(destroyed);
	});

	it("survives StrictMode double-invoke: manager stays alive and plugins still fire (WizardProvider)", async () => {
		const beforeTransition = vi.fn(() => true);
		const plugins: WizardPlugin<D>[] = [{ name: "p", beforeTransition }];
		const captured: { nav: ReturnType<typeof useWizardNavigation> | null } = {
			nav: null,
		};
		const Child = () => {
			captured.nav = useWizardNavigation();
			return <div>child</div>;
		};
		render(
			<StrictMode>
				<WizardProvider
					definition={def}
					initialData={{ name: "" }}
					plugins={plugins}
				>
					<Child />
				</WizardProvider>
			</StrictMode>,
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});

		await act(async () => {
			await captured.nav?.goNext();
		});

		expect(beforeTransition).toHaveBeenCalled();
	});
});
