import type { StepStatus } from "@gooonzick/wizard-core";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type React from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface WizardProgressProps {
	currentStepId: string;
	stepIds: string[];
	stepTitles: Record<string, string>;
	stepStatuses: Record<string, StepStatus>;
	onStepClick?: (stepId: string) => void;
}

export const WizardProgress: React.FC<WizardProgressProps> = ({
	stepIds,
	stepTitles,
	stepStatuses,
	onStepClick,
}) => {
	const completedCount = stepIds.filter(
		(id) => stepStatuses[id] === "completed",
	).length;
	const progressPercent = (completedCount / stepIds.length) * 100;

	return (
		<div className="space-y-4 mb-6">
			<Progress value={progressPercent} className="h-2" />
			<div className="flex justify-between items-center">
				{stepIds.map((stepId, index) => {
					const status = stepStatuses[stepId];
					const isClickable =
						(status === "completed" || status === "visited") && !!onStepClick;

					return (
						<button
							type="button"
							key={stepId}
							className={cn(
								"flex flex-col items-center flex-1 bg-transparent border-none p-0",
								isClickable && "cursor-pointer",
							)}
							disabled={!isClickable}
							onClick={() => isClickable && onStepClick(stepId)}
						>
							<div
								className={cn(
									"flex items-center justify-center w-10 h-10 rounded-full border-2 mb-2 transition-colors",
									status === "completed"
										? "bg-green-500 border-green-500"
										: status === "active"
											? "bg-blue-500 border-blue-500"
											: status === "error"
												? "bg-red-500 border-red-500"
												: status === "visited"
													? "bg-blue-200 border-blue-300"
													: "bg-gray-200 border-gray-300",
									isClickable && "hover:ring-2 hover:ring-green-300",
								)}
							>
								{status === "completed" ? (
									<CheckCircle2 className="w-5 h-5 text-white" />
								) : status === "error" ? (
									<AlertCircle className="w-5 h-5 text-white" />
								) : (
									<span
										className={cn(
											"text-sm font-semibold",
											status === "active" ? "text-white" : "text-gray-700",
										)}
									>
										{index + 1}
									</span>
								)}
							</div>
							<span
								className={cn(
									"text-xs font-medium text-center line-clamp-2",
									status === "active"
										? "text-blue-600"
										: status === "error"
											? "text-red-600"
											: "text-gray-600",
								)}
							>
								{stepTitles[stepId] || stepId}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
};
