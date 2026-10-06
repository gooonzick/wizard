import {
	createWizard,
	type LazyStepImplementation,
} from "@gooonzick/wizard-core";
import type { LazyDemoData } from "./types";

let failNextLoad = false;

/** Demo switch: makes the next documents-step load reject once. */
export function armLoadFailure(): void {
	failNextLoad = true;
}

async function loadDocumentsStep(): Promise<
	LazyStepImplementation<LazyDemoData>
> {
	// Artificial latency so the loading state is visible in the demo.
	await new Promise((resolve) => setTimeout(resolve, 800));
	if (failNextLoad) {
		failNextLoad = false;
		throw new Error("Simulated chunk load failure");
	}
	const module = await import("./documents-step");
	return module.documentsStep;
}

export function createLazyStepsWizard() {
	// A fresh wizard starts with no armed failure (the flag is module-level).
	failNextLoad = false;
	return createWizard<LazyDemoData>("lazy-steps")
		.initialStep("account")
		.step("account", (s) =>
			s
				.title("Account")
				.description("An ordinary eager step.")
				.required("email")
				.next("documents"),
		)
		.step("documents", (s) =>
			s
				.title("Documents")
				.description(
					"validate + onEnter come from a separate chunk, loaded on first entry.",
				)
				.previous("account")
				.next("summary")
				.lazy(loadDocumentsStep),
		)
		.step("summary", (s) => s.title("Summary").previous("documents"))
		.build();
}
