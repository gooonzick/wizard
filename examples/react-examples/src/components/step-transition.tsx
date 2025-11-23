import type React from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StepTransitionProps {
	children: ReactNode;
	className?: string;
}

export const StepTransition: React.FC<StepTransitionProps> = ({
	children,
	className = "",
}) => {
	return (
		<div className={cn("animate-in fade-in duration-300", className)}>
			{children}
		</div>
	);
};
