import { CheckCircle2, Circle } from "lucide-react";
import type React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface WizardSidebarProps {
	data: Record<string, unknown>;
	currentStepId: string;
	stepIds: string[];
	stepTitles: Record<string, string>;
	fieldLabels: Record<string, string>;
}

export const WizardSidebar: React.FC<WizardSidebarProps> = ({
	data,
	currentStepId,
	stepIds,
	stepTitles,
	fieldLabels,
}) => {
	const currentIndex = stepIds.indexOf(currentStepId);

	return (
		<div className="sticky top-6 max-h-[calc(100vh-2rem)] overflow-y-auto">
			<Card className="p-6 space-y-6">
				<div>
					<h3 className="font-semibold text-lg mb-3">Summary</h3>
					<div className="space-y-2">
						{Object.entries(data).map(([key, value]) => {
							// Skip non-primitive values or empty values
							if (
								typeof value === "object" ||
								(typeof value === "string" && value === "")
							) {
								return null;
							}

							return (
								<div key={key} className="text-sm">
									<span className="text-gray-600">
										{fieldLabels[key] || key}:
									</span>
									<span className="font-medium ml-2">
										{typeof value === "boolean"
											? value
												? "Yes"
												: "No"
											: String(value)}
									</span>
								</div>
							);
						})}
					</div>
				</div>

				<div className="border-t pt-4">
					<h3 className="font-semibold text-sm mb-3">Progress</h3>
					<div className="space-y-2">
						{stepIds.map((stepId, index) => {
							const isCompleted = index < currentIndex;
							const isCurrent = stepId === currentStepId;

							return (
								<div key={stepId} className="flex items-center gap-2">
									{isCompleted ? (
										<CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
									) : (
										<Circle
											className={cn(
												"w-4 h-4 shrink-0",
												isCurrent ? "text-blue-500" : "text-gray-300",
											)}
										/>
									)}
									<span
										className={cn(
											"text-sm",
											isCurrent
												? "font-semibold text-blue-600"
												: isCompleted
													? "text-gray-600"
													: "text-gray-500",
										)}
									>
										{stepTitles[stepId] || stepId}
									</span>
								</div>
							);
						})}
					</div>
				</div>
			</Card>
		</div>
	);
};
