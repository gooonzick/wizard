import { createWizard } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// ── Data type ──────────────────────────────────────────────────────

type SignupData = {
	email: string;
	password: string;
	plan: "free" | "pro";
	acceptedTerms: boolean;
};

// ── Wizard definition ──────────────────────────────────────────────

const signupWizard = createWizard<SignupData>("signup")
	.initialStep("account")
	.step("account", (s) =>
		s
			.title("Create Account")
			.required("email", "password")
			.next("plan"),
	)
	.step("plan", (s) =>
		s.title("Select Plan").previous("account").next("review"),
	)
	.step("review", (s) =>
		s
			.title("Review & Confirm")
			.previous("plan")
			.validate((d) => ({
				valid: d.acceptedTerms,
				errors: d.acceptedTerms
					? undefined
					: { acceptedTerms: "You must accept the terms" },
			})),
	)
	.onCancel(async (data) => {
		// Declarative server-side cleanup (e.g. delete a draft).
		// This runs before the machine resets to step 1.
		console.log("[definition.onCancel] cleaning up draft for", data.email);
	})
	.build();

const initialData: SignupData = {
	email: "",
	password: "",
	plan: "free",
	acceptedTerms: false,
};

// ── Step fields ────────────────────────────────────────────────────

function StepFields({
	stepId,
	data,
	onChange,
}: {
	stepId: string;
	data: SignupData;
	onChange: <K extends keyof SignupData>(field: K, value: SignupData[K]) => void;
}) {
	switch (stepId) {
		case "account":
			return (
				<div className="space-y-4">
					<label className="block">
						<span className="text-sm font-medium text-gray-700">Email</span>
						<input
							type="email"
							className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
							value={data.email}
							onChange={(e) => onChange("email", e.target.value)}
							placeholder="you@example.com"
						/>
					</label>
					<label className="block">
						<span className="text-sm font-medium text-gray-700">Password</span>
						<input
							type="password"
							className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
							value={data.password}
							onChange={(e) => onChange("password", e.target.value)}
							placeholder="••••••••"
						/>
					</label>
				</div>
			);
		case "plan":
			return (
				<div className="space-y-3">
					{(["free", "pro"] as const).map((p) => (
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
									{p === "free" ? "Free forever" : "$10/month — all features"}
								</div>
							</div>
						</label>
					))}
				</div>
			);
		case "review":
			return (
				<div className="space-y-4">
					<div className="space-y-1 text-sm">
						<p>
							<strong>Email:</strong> {data.email || "—"}
						</p>
						<p>
							<strong>Plan:</strong> {data.plan}
						</p>
					</div>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={data.acceptedTerms}
							onChange={(e) => onChange("acceptedTerms", e.target.checked)}
							className="accent-blue-600"
						/>
						<span>I accept the terms of service</span>
					</label>
				</div>
			);
		default:
			return null;
	}
}

// ── Event log ──────────────────────────────────────────────────────

type LogEntry = { id: number; type: "reset" | "cancel" | "complete"; text: string };

function EventLog({ entries }: { entries: LogEntry[] }) {
	const colour: Record<LogEntry["type"], string> = {
		reset: "bg-blue-50 text-blue-700 border-blue-200",
		cancel: "bg-amber-50 text-amber-700 border-amber-200",
		complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
	};

	return (
		<Card className="p-5">
			<h3 className="text-sm font-semibold text-gray-700 mb-3">Event log</h3>
			{entries.length === 0 ? (
				<p className="text-xs text-gray-400 italic">
					Click <code>Reset</code> or <code>Cancel</code> to fire events
				</p>
			) : (
				<ul className="space-y-1.5">
					{entries
						.slice()
						.reverse()
						.map((e) => (
							<li
								key={e.id}
								className={`text-xs rounded-md border px-2 py-1.5 ${colour[e.type]}`}
							>
								<span className="font-mono font-semibold uppercase mr-2">
									{e.type}
								</span>
								{e.text}
							</li>
						))}
				</ul>
			)}
			<p className="mt-3 text-xs text-gray-400">
				<strong>Reset</strong> rewinds to step 1 with the original data.
				<br />
				<strong>Cancel</strong> awaits <code>onCancel</code> first (e.g. for
				server cleanup), then resets.
			</p>
		</Card>
	);
}

// ── Main component ─────────────────────────────────────────────────

export const ResetCancelExample: React.FC = () => {
	const [log, setLog] = useState<LogEntry[]>([]);
	const append = (entry: Omit<LogEntry, "id">) =>
		setLog((prev) => [...prev, { ...entry, id: prev.length }]);

	const { navigation, actions, state, validation } = useWizard({
		definition: signupWizard,
		initialData,
		onComplete: (data) => {
			append({ type: "complete", text: `Signed up ${data.email}` });
		},
		onCancel: (data) => {
			append({
				type: "cancel",
				text: `cancel() called with email="${data.email || "—"}"`,
			});
		},
		onReset: () => {
			append({ type: "reset", text: "Wizard reset to initial state" });
		},
	});

	const handleCancel = async () => {
		if (!confirm("Discard your progress? This cannot be undone.")) return;
		await actions.cancel();
	};

	return (
		<div className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-5xl mx-auto">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-gray-900">Reset & Cancel</h1>
					<p className="text-gray-600 mt-1">
						Demonstrates <code>actions.reset()</code>, <code>actions.cancel()</code>,
						and the <code>onReset</code> / <code>onCancel</code> events
						(WIZ-005).
					</p>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
					<Card className="p-8">
						<h2 className="text-xl font-semibold mb-1">
							Step {state.currentStep.id}: {state.currentStep.meta?.title}
						</h2>

						{validation.validationErrors &&
							Object.entries(validation.validationErrors).map(([f, m]) => (
								<p key={f} className="text-sm text-red-600 mb-2">
									{m}
								</p>
							))}

						<div className="mt-4">
							<StepFields
								stepId={state.currentStep.id}
								data={state.data}
								onChange={actions.updateField}
							/>
						</div>

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
								<Button
									onClick={() => actions.submit()}
									className="bg-green-600 hover:bg-green-700"
								>
									Complete sign up
								</Button>
							)}

							<div className="flex-1" />

							<Button
								variant="outline"
								onClick={() => actions.reset()}
								className="text-blue-700 border-blue-300 hover:bg-blue-50"
							>
								Reset
							</Button>
							<Button
								variant="outline"
								onClick={handleCancel}
								className="text-amber-700 border-amber-300 hover:bg-amber-50"
							>
								Cancel
							</Button>
						</div>

						{state.isCompleted && (
							<p className="mt-4 text-sm text-emerald-700 font-medium">
								✓ Sign up completed.
							</p>
						)}
					</Card>

					<EventLog entries={log} />
				</div>
			</div>
		</div>
	);
};
