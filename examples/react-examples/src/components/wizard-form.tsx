import type React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { RegistrationData } from "@/wizard-example";
import { StepTransition } from "./step-transition";
import { ValidationMessage } from "./validation-message";

interface WizardFormProps {
	currentStepId: string;
	data: RegistrationData;
	validationErrors: Record<string, string> | undefined;
	onFieldChange: (
		field: keyof RegistrationData,
		value: RegistrationData[keyof RegistrationData],
	) => void;
}

export const WizardForm: React.FC<WizardFormProps> = ({
	currentStepId,
	data,
	validationErrors,
	onFieldChange,
}) => {
	return (
		<StepTransition>
			<Card className="p-8">
				<div className="space-y-6">
					{/* Personal Step */}
					{currentStepId === "personal" && (
						<div className="space-y-4">
							<div>
								<Label htmlFor="firstName" className="block mb-2">
									First Name
								</Label>
								<Input
									id="firstName"
									type="text"
									value={data.firstName as string}
									onChange={(e) => onFieldChange("firstName", e.target.value)}
									className={
										validationErrors?.firstName ? "border-red-500" : ""
									}
									placeholder="Enter your first name"
								/>
								<ValidationMessage error={validationErrors?.firstName} />
							</div>

							<div>
								<Label htmlFor="lastName" className="block mb-2">
									Last Name
								</Label>
								<Input
									id="lastName"
									type="text"
									value={data.lastName as string}
									onChange={(e) => onFieldChange("lastName", e.target.value)}
									className={validationErrors?.lastName ? "border-red-500" : ""}
									placeholder="Enter your last name"
								/>
								<ValidationMessage error={validationErrors?.lastName} />
							</div>

							<div>
								<Label htmlFor="email" className="block mb-2">
									Email Address
								</Label>
								<Input
									id="email"
									type="email"
									value={data.email as string}
									onChange={(e) => onFieldChange("email", e.target.value)}
									className={validationErrors?.email ? "border-red-500" : ""}
									placeholder="Enter your email"
								/>
								<ValidationMessage error={validationErrors?.email} />
							</div>
						</div>
					)}

					{/* Preferences Step */}
					{currentStepId === "preferences" && (
						<div className="space-y-4">
							<div className="flex items-center gap-3">
								<Checkbox
									id="newsletter"
									checked={data.newsletter as boolean}
									onCheckedChange={(checked) =>
										onFieldChange("newsletter", checked)
									}
								/>
								<Label htmlFor="newsletter" className="cursor-pointer">
									Subscribe to newsletter for updates
								</Label>
							</div>

							<div>
								<Label htmlFor="theme" className="block mb-2">
									Preferred Theme
								</Label>
								<Select
									value={data.theme as string}
									onValueChange={(value) => onFieldChange("theme", value)}
								>
									<SelectTrigger id="theme">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="light">Light</SelectItem>
										<SelectItem value="dark">Dark</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					)}

					{/* Review Step */}
					{currentStepId === "review" && (
						<div className="space-y-4">
							<Alert>
								<AlertTitle>Review Your Information</AlertTitle>
								<AlertDescription>
									Please review your information before submitting
								</AlertDescription>
							</Alert>

							<div className="grid grid-cols-2 gap-4 py-4">
								<div>
									<p className="text-sm text-gray-600">Full Name</p>
									<p className="font-semibold">
										{data.firstName} {data.lastName}
									</p>
								</div>
								<div>
									<p className="text-sm text-gray-600">Email</p>
									<p className="font-semibold">{data.email}</p>
								</div>
								<div>
									<p className="text-sm text-gray-600">Newsletter</p>
									<p className="font-semibold">
										{data.newsletter ? "Subscribed" : "Not subscribed"}
									</p>
								</div>
								<div>
									<p className="text-sm text-gray-600">Theme</p>
									<p className="font-semibold capitalize">{data.theme}</p>
								</div>
							</div>
						</div>
					)}
				</div>
			</Card>
		</StepTransition>
	);
};
