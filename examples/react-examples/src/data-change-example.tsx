import { createWizard } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// ── Data type ──────────────────────────────────────────────────────

type OrderData = {
	plan: "basic" | "pro";
	quantity: number;
	unitPrice: number; // auto-filled from plan
	total: number; // recomputed = quantity * unitPrice
	needsInvoice: boolean;
	companyName: string; // cleared when needsInvoice turns off
};

const PRICES: Record<OrderData["plan"], number> = {
	basic: 10,
	pro: 25,
};

// ── Wizard definition ───────────────────────────────────────────────
// Single step: the point of this example is the data cascade driven by
// `onDataChange`, not navigation.

const orderWizard = createWizard<OrderData>("order")
	.initialStep("order")
	.step("order", (s) => s.title("Order Details"))
	.build();

const initialData: OrderData = {
	plan: "basic",
	quantity: 1,
	unitPrice: PRICES.basic,
	total: PRICES.basic * 1,
	needsInvoice: false,
	companyName: "",
};

// ── Step fields ────────────────────────────────────────────────────

function OrderFields({
	data,
	onChange,
}: {
	data: OrderData;
	onChange: <K extends keyof OrderData>(field: K, value: OrderData[K]) => void;
}) {
	return (
		<div className="space-y-4">
			<div className="space-y-3">
				{(["basic", "pro"] as const).map((p) => (
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
							<div className="text-xs text-gray-500">${PRICES[p]} / unit</div>
						</div>
					</label>
				))}
			</div>

			<label className="block">
				<span className="text-sm font-medium text-gray-700">Quantity</span>
				<input
					type="number"
					min={1}
					className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
					value={data.quantity}
					onChange={(e) => onChange("quantity", Number(e.target.value) || 1)}
				/>
			</label>

			<div className="grid grid-cols-2 gap-4 text-sm">
				<div>
					<span className="text-gray-500">Unit price (auto-filled)</span>
					<p className="font-mono font-medium">${data.unitPrice}</p>
				</div>
				<div>
					<span className="text-gray-500">Total (recomputed)</span>
					<p className="font-mono font-medium">${data.total}</p>
				</div>
			</div>

			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={data.needsInvoice}
					onChange={(e) => onChange("needsInvoice", e.target.checked)}
					className="accent-blue-600"
				/>
				<span>I need an invoice</span>
			</label>

			<label className="block">
				<span className="text-sm font-medium text-gray-700">Company name</span>
				<input
					type="text"
					disabled={!data.needsInvoice}
					className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
					value={data.companyName}
					onChange={(e) => onChange("companyName", e.target.value)}
					placeholder="Acme Inc."
				/>
			</label>
		</div>
	);
}

// ── Data change log ──────────────────────────────────────────────────

type LogEntry = {
	id: number;
	changedFields: (keyof OrderData)[];
	text: string;
};

function DataChangeLog({ entries }: { entries: LogEntry[] }) {
	return (
		<Card className="p-5">
			<h3 className="text-sm font-semibold text-gray-700 mb-3">
				Data change log
			</h3>
			{entries.length === 0 ? (
				<p className="text-xs text-gray-400 italic">
					Edit a field to fire <code>onDataChange</code>
				</p>
			) : (
				<ul className="space-y-1.5">
					{entries
						.slice()
						.reverse()
						.map((e) => (
							<li
								key={e.id}
								className="text-xs rounded-md border px-2 py-1.5 bg-blue-50 text-blue-700 border-blue-200"
							>
								<span className="font-mono font-semibold mr-2">
									{e.changedFields.join(", ")}
								</span>
								{e.text}
							</li>
						))}
				</ul>
			)}
			<p className="mt-3 text-xs text-gray-400">
				Changing <strong>plan</strong> auto-fills <strong>unitPrice</strong>,
				which (with <strong>quantity</strong>) recomputes <strong>total</strong>
				. Unchecking <strong>needsInvoice</strong> clears{" "}
				<strong>companyName</strong>. Each cascade step is its own{" "}
				<code>onDataChange</code> round, and terminates via the{" "}
				<code>Object.is</code> no-op guard on <code>updateField</code>.
			</p>
		</Card>
	);
}

// ── Main component ─────────────────────────────────────────────────

export const DataChangeExample: React.FC = () => {
	const [log, setLog] = useState<LogEntry[]>([]);

	const { actions, state } = useWizard({
		definition: orderWizard,
		initialData,
		onDataChange: (_prev, next, changedFields) => {
			// Auto-fill the dependent unit price when the plan changes.
			if (changedFields.includes("plan")) {
				actions.updateField("unitPrice", PRICES[next.plan]);
			}
			// Recompute the total whenever quantity or unitPrice changes.
			if (
				changedFields.includes("quantity") ||
				changedFields.includes("unitPrice")
			) {
				actions.updateField("total", next.quantity * next.unitPrice);
			}
			// Clear the dependent company name when the invoice flag turns off.
			if (changedFields.includes("needsInvoice") && !next.needsInvoice) {
				actions.updateField("companyName", "");
			}

			setLog((prevLog) => [
				...prevLog,
				{
					id: prevLog.length,
					changedFields,
					text: `→ unitPrice=${next.unitPrice}, total=${next.total}, companyName="${next.companyName}"`,
				},
			]);
		},
	});

	return (
		<div className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-5xl mx-auto">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-gray-900">Data Change</h1>
					<p className="text-gray-600 mt-1">
						Demonstrates <code>onDataChange</code> driving dependent-field
						auto-fill, recomputation, and cleanup via <code>updateField</code>{" "}
						(WIZ-010).
					</p>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
					<Card className="p-8">
						<h2 className="text-xl font-semibold mb-4">
							{state.currentStep.meta?.title}
						</h2>

						<OrderFields data={state.data} onChange={actions.updateField} />

						<div className="flex flex-wrap gap-3 mt-8 pt-6 border-t">
							<Button onClick={() => actions.submit()}>Complete order</Button>
						</div>

						{state.isCompleted && (
							<p className="mt-4 text-sm text-emerald-700 font-medium">
								✓ Order submitted.
							</p>
						)}
					</Card>

					<DataChangeLog entries={log} />
				</div>
			</div>
		</div>
	);
};
