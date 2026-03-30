import { createWizard } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// ── Data type ──────────────────────────────────────────────────────

type PlanType = "basic" | "pro" | "enterprise";

type CheckoutData = {
	name: string;
	plan: PlanType;
	coupon: string;
	company: string;
};

// ── Wizard definition with conditional branching ───────────────────

const checkoutWizard = createWizard<CheckoutData>("checkout")
	.initialStep("personal")
	.step("personal", (s) =>
		s.title("Personal Info").required("name").next("plan"),
	)
	.step("plan", (s) =>
		s
			.title("Select Plan")
			.required("plan")
			.previous("personal")
			.nextWhen([
				{
					when: (d) => d.plan === "enterprise",
					to: "company",
				},
				{
					when: (d) => d.plan === "pro",
					to: "addons",
				},
				{ when: () => true, to: "review" },
			]),
	)
	.step("company", (s) =>
		s
			.title("Company Details")
			.required("company")
			.previous("plan")
			.next("review"),
	)
	.step("addons", (s) => s.title("Pro Add-ons").previous("plan").next("review"))
	.step("review", (s) => s.title("Review & Pay").previous("plan"))
	.build();

const initialData: CheckoutData = {
	name: "",
	plan: "basic",
	coupon: "",
	company: "",
};

// ── Step form fields ───────────────────────────────────────────────

function StepFields({
	stepId,
	data,
	onChange,
}: {
	stepId: string;
	data: CheckoutData;
	onChange: <K extends keyof CheckoutData>(
		field: K,
		value: CheckoutData[K],
	) => void;
}) {
	switch (stepId) {
		case "personal":
			return (
				<div className="space-y-4">
					<label className="block">
						<span className="text-sm font-medium text-gray-700">Name</span>
						<input
							className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
							value={data.name}
							onChange={(e) => onChange("name", e.target.value)}
							placeholder="Your name"
						/>
					</label>
				</div>
			);
		case "plan":
			return (
				<div className="space-y-3">
					<span className="text-sm font-medium text-gray-700">
						Choose a plan
					</span>
					{(["basic", "pro", "enterprise"] as const).map((p) => (
						<label
							key={p}
							className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition ${
								data.plan === p
									? "border-blue-500 bg-blue-50"
									: "border-gray-200 hover:bg-gray-50"
							}`}
						>
							<input
								type="radio"
								name="plan"
								value={p}
								checked={data.plan === p}
								onChange={() => onChange("plan", p)}
								className="accent-blue-600"
							/>
							<div>
								<div className="font-medium capitalize">{p}</div>
								<div className="text-xs text-gray-500">
									{p === "basic" && "Free tier — limited features"}
									{p === "pro" && "Pro add-ons available"}
									{p === "enterprise" && "Custom billing — needs company info"}
								</div>
							</div>
						</label>
					))}
				</div>
			);
		case "company":
			return (
				<label className="block">
					<span className="text-sm font-medium text-gray-700">
						Company Name
					</span>
					<input
						className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
						value={data.company}
						onChange={(e) => onChange("company", e.target.value)}
						placeholder="Acme Inc."
					/>
				</label>
			);
		case "addons":
			return (
				<label className="block">
					<span className="text-sm font-medium text-gray-700">
						Coupon code (optional)
					</span>
					<input
						className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
						value={data.coupon}
						onChange={(e) => onChange("coupon", e.target.value)}
						placeholder="SAVE20"
					/>
				</label>
			);
		case "review":
			return (
				<div className="space-y-2 text-sm">
					<p>
						<strong>Name:</strong> {data.name || "—"}
					</p>
					<p>
						<strong>Plan:</strong> {data.plan}
					</p>
					{data.company && (
						<p>
							<strong>Company:</strong> {data.company}
						</p>
					)}
					{data.coupon && (
						<p>
							<strong>Coupon:</strong> {data.coupon}
						</p>
					)}
				</div>
			);
		default:
			return null;
	}
}

// ── History stack visualisation ────────────────────────────────────

function HistoryStack({ history }: { history: string[] }) {
	const titles: Record<string, string> = {
		personal: "Personal",
		plan: "Plan",
		company: "Company",
		addons: "Add-ons",
		review: "Review",
	};

	return (
		<Card className="p-5">
			<h3 className="text-sm font-semibold text-gray-700 mb-3">
				Navigation History Stack
			</h3>
			<div className="flex flex-col-reverse gap-1.5">
				{history.map((stepId, i) => {
					const isTop = i === history.length - 1;
					// Build a stable key from the path up to this point (handles repeated steps)
					const key = history.slice(0, i + 1).join(">");
					return (
						<div
							key={key}
							className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
								isTop
									? "bg-blue-100 text-blue-800 font-medium ring-1 ring-blue-300"
									: "bg-gray-100 text-gray-600"
							}`}
						>
							<span className="font-mono text-xs text-gray-400 w-4">{i}</span>
							<span>{titles[stepId] ?? stepId}</span>
							{isTop && (
								<span className="ml-auto text-[10px] uppercase tracking-wide text-blue-500">
									current
								</span>
							)}
						</div>
					);
				})}
			</div>
			{history.length === 0 && (
				<p className="text-xs text-gray-400 italic">Stack empty</p>
			)}
			<p className="mt-3 text-xs text-gray-400">
				Back pops the stack — forward pushes. The resolver is never consulted
				when history is available, so conditional branches always go back to
				where you <em>actually</em> came from.
			</p>
		</Card>
	);
}

// ── Main component ─────────────────────────────────────────────────

export const HistoryExample: React.FC = () => {
	const { navigation, actions, state, validation } = useWizard({
		definition: checkoutWizard,
		initialData,
		onComplete: (data) => {
			console.log("Checkout complete!", data);
			alert("Checkout complete! Check console.");
		},
	});

	return (
		<div className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-5xl mx-auto">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-gray-900">
						Navigation History Stack
					</h1>
					<p className="text-gray-600 mt-1">
						Conditional branching checkout — &quot;Back&quot; always returns to
						the step you <em>actually</em> came from
					</p>
				</div>

				{/* Layout */}
				<div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
					{/* Form */}
					<Card className="p-8">
						<h2 className="text-xl font-semibold mb-1">
							{state.currentStep.meta?.title ?? state.currentStep.id}
						</h2>
						{state.currentStep.meta?.description && (
							<p className="text-sm text-gray-500 mb-4">
								{state.currentStep.meta.description}
							</p>
						)}

						{validation.validationErrors &&
							Object.entries(validation.validationErrors).map(
								([field, msg]) => (
									<p key={field} className="text-sm text-red-600 mb-2">
										{msg}
									</p>
								),
							)}

						<StepFields
							stepId={state.currentStep.id}
							data={state.data}
							onChange={actions.updateField}
						/>

						{/* Controls */}
						<div className="flex gap-3 mt-6">
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
								<Button
									onClick={() => actions.submit()}
									className="bg-green-600 hover:bg-green-700"
								>
									Complete
								</Button>
							)}
						</div>
					</Card>

					{/* History sidebar */}
					<HistoryStack history={navigation.stepHistory} />
				</div>
			</div>
		</div>
	);
};
