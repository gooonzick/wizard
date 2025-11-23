import { CheckCircle2 } from "lucide-react";
import type React from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface WizardProgressProps {
	currentStepId: string;
	stepIds: string[];
	stepTitles: Record<string, string>;
}

export const WizardProgress: React.FC<WizardProgressProps> = ({
	currentStepId,
	stepIds,
	stepTitles,
}) => {
	const currentIndex = stepIds.indexOf(currentStepId);
	const progressPercent = ((currentIndex + 1) / stepIds.length) * 100;

	return (
		<div className="space-y-4 mb-6">
			<Progress value={progressPercent} className="h-2" />
			<div className="flex justify-between items-center">
				{stepIds.map((stepId, index) => {
					const isCompleted = index < currentIndex;
					const isCurrent = stepId === currentStepId;

					return (
						<div key={stepId} className="flex flex-col items-center flex-1">
							<div
								className={cn(
									"flex items-center justify-center w-10 h-10 rounded-full border-2 mb-2 transition-colors",
									isCompleted
										? "bg-green-500 border-green-500"
										: isCurrent
											? "bg-blue-500 border-blue-500"
											: "bg-gray-200 border-gray-300",
								)}
							>
								{isCompleted ? (
									<CheckCircle2 className="w-5 h-5 text-white" />
								) : (
									<span className="text-sm font-semibold text-gray-700">
										{index + 1}
									</span>
								)}
							</div>
							<span
								className={cn(
									"text-xs font-medium text-center line-clamp-2",
									isCurrent ? "text-blue-600" : "text-gray-600",
								)}
							>
								{stepTitles[stepId] || stepId}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
};
