import {
	createWizard,
	type WizardSerializedState,
} from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const STORAGE_KEY = "wizard-react-persistence-example";

interface CheckoutData extends Record<string, unknown> {
	contactName: string;
	email: string;
	shippingAddress: string;
	deliverySpeed: "standard" | "express";
	giftWrap: boolean;
}

const checkoutWizard = createWizard<CheckoutData>("persisted-checkout")
	.initialStep("contact")
	.step("contact", (s) =>
		s.title("Contact").required("contactName", "email").next("shipping"),
	)
	.step("shipping", (s) =>
		s
			.title("Shipping")
			.required("shippingAddress")
			.previous("contact")
			.next("review"),
	)
	.step("review", (s) => s.title("Review").previous("shipping"))
	.build();

const initialData: CheckoutData = {
	contactName: "",
	email: "",
	shippingAddress: "",
	deliverySpeed: "standard",
	giftWrap: false,
};

const stepTitles: Record<string, string> = {
	contact: "Contact",
	shipping: "Shipping",
	review: "Review",
};

export const StatePersistenceExample: React.FC = () => {
	const [restoreMessage, setRestoreMessage] = useState("No saved draft loaded");
	const hasHydrated = useRef(false);

	const { navigation, actions, state, validation } = useWizard({
		definition: checkoutWizard,
		initialData,
		onComplete: (data) => {
			alert(`Checkout complete for ${data.email}`);
			localStorage.removeItem(STORAGE_KEY);
		},
	});
	const persistenceKey = JSON.stringify({
		currentStepId: state.currentStepId,
		data: state.data,
		isCompleted: state.isCompleted,
		stepHistory: navigation.stepHistory,
		stepStatuses: state.stepStatuses,
		visitedSteps: navigation.visitedSteps,
	});

	useEffect(() => {
		const savedState = localStorage.getItem(STORAGE_KEY);
		if (!savedState) {
			hasHydrated.current = true;
			return;
		}

		try {
			actions.restore(
				JSON.parse(savedState) as WizardSerializedState<CheckoutData>,
			);
			setRestoreMessage("Saved draft restored from localStorage");
		} catch {
			localStorage.removeItem(STORAGE_KEY);
			setRestoreMessage("Saved draft was incompatible and was cleared");
		}

		hasHydrated.current = true;
	}, [actions]);

	useEffect(() => {
		if (!hasHydrated.current) return;
		void persistenceKey;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(actions.serialize()));
	}, [actions, persistenceKey]);

	const clearDraft = () => {
		localStorage.removeItem(STORAGE_KEY);
		actions.reset();
		setRestoreMessage("Saved draft cleared");
	};

	return (
		<div className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-5xl mx-auto">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-gray-900">
						State Persistence
					</h1>
					<p className="text-gray-600 mt-1">
						Saves a checkout draft with <code>actions.serialize()</code> and
						restores it with <code>actions.restore()</code>.
					</p>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
					<Card className="p-8">
						<h2 className="text-xl font-semibold mb-1">
							{state.currentStep.meta?.title ?? state.currentStep.id}
						</h2>
						<p className="text-sm text-gray-500 mb-6">
							{restoreMessage}. Refresh the page or switch tabs to see the saved
							step and form data return.
						</p>

						{validation.validationErrors &&
							Object.entries(validation.validationErrors).map(
								([field, message]) => (
									<p key={field} className="text-sm text-red-600 mb-2">
										{message}
									</p>
								),
							)}

						{state.currentStepId === "contact" && (
							<div className="space-y-4">
								<label className="block">
									<span className="text-sm font-medium text-gray-700">
										Name
									</span>
									<input
										value={state.data.contactName}
										className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
										placeholder="Ada Lovelace"
										onChange={(event) =>
											actions.updateField("contactName", event.target.value)
										}
									/>
								</label>
								<label className="block">
									<span className="text-sm font-medium text-gray-700">
										Email
									</span>
									<input
										value={state.data.email}
										className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
										placeholder="ada@example.com"
										onChange={(event) =>
											actions.updateField("email", event.target.value)
										}
									/>
								</label>
							</div>
						)}

						{state.currentStepId === "shipping" && (
							<div className="space-y-4">
								<label className="block">
									<span className="text-sm font-medium text-gray-700">
										Shipping address
									</span>
									<textarea
										value={state.data.shippingAddress}
										className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
										rows={4}
										placeholder="123 Example Street"
										onChange={(event) =>
											actions.updateField("shippingAddress", event.target.value)
										}
									/>
								</label>
								<label className="block">
									<span className="text-sm font-medium text-gray-700">
										Delivery speed
									</span>
									<select
										value={state.data.deliverySpeed}
										className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
										onChange={(event) =>
											actions.updateField(
												"deliverySpeed",
												event.target.value as CheckoutData["deliverySpeed"],
											)
										}
									>
										<option value="standard">Standard</option>
										<option value="express">Express</option>
									</select>
								</label>
							</div>
						)}

						{state.currentStepId === "review" && (
							<div className="space-y-3 text-sm">
								<p>
									<strong>Name:</strong> {state.data.contactName || "-"}
								</p>
								<p>
									<strong>Email:</strong> {state.data.email || "-"}
								</p>
								<p>
									<strong>Address:</strong> {state.data.shippingAddress || "-"}
								</p>
								<label className="flex items-center gap-2">
									<input
										type="checkbox"
										checked={state.data.giftWrap}
										className="accent-blue-600"
										onChange={(event) =>
											actions.updateField("giftWrap", event.target.checked)
										}
									/>
									<span>Add gift wrap</span>
								</label>
							</div>
						)}

						<div className="flex flex-wrap gap-3 mt-8 pt-6 border-t">
							<Button
								variant="outline"
								onClick={() => navigation.goPrevious()}
								disabled={!navigation.canGoBack}
							>
								Back
							</Button>
							{!navigation.isLastStep ? (
								<Button
									onClick={() => navigation.goNext()}
									disabled={!navigation.canGoNext}
								>
									Next
								</Button>
							) : (
								<Button onClick={() => actions.submit()}>
									Complete checkout
								</Button>
							)}
							<div className="flex-1" />
							<Button variant="outline" onClick={clearDraft}>
								Clear draft
							</Button>
						</div>
					</Card>

					<Card className="p-5">
						<h3 className="text-sm font-semibold text-gray-700 mb-3">
							Persisted Snapshot
						</h3>
						<div className="space-y-3 text-sm">
							<div>
								<p className="text-xs uppercase text-gray-400 mb-1">History</p>
								<p className="font-mono text-xs text-gray-700">
									{navigation.stepHistory.join(" -> ")}
								</p>
							</div>
							<div>
								<p className="text-xs uppercase text-gray-400 mb-1">Visited</p>
								<div className="flex flex-wrap gap-1.5">
									{navigation.visitedSteps.map((stepId) => (
										<span
											key={stepId}
											className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700"
										>
											{stepTitles[stepId] ?? stepId}
										</span>
									))}
								</div>
							</div>
							<div>
								<p className="text-xs uppercase text-gray-400 mb-1">Statuses</p>
								<ul className="space-y-1">
									{Object.entries(state.stepStatuses).map(
										([stepId, status]) => (
											<li key={stepId} className="flex justify-between gap-3">
												<span>{stepTitles[stepId] ?? stepId}</span>
												<span className="font-mono text-xs text-gray-500">
													{status}
												</span>
											</li>
										),
									)}
								</ul>
							</div>
						</div>
					</Card>
				</div>
			</div>
		</div>
	);
};
