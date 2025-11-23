import { createWizardContext, WizardMachine } from "../index";
import {
	type OnboardingData,
	onboardingWizard,
} from "./onboarding-wizard-builder";
import {
	type SignupWizardData,
	signupWizard,
} from "./signup-wizard-declarative";

/**
 * Example: Using WizardMachine to execute a wizard
 */

async function runSignupWizardExample() {
	console.log("=== SIGNUP WIZARD EXAMPLE ===\n");

	// Initial data
	const initialData: SignupWizardData = {
		name: "",
		email: "",
		age: 0,
		plan: "basic",
		billingCycle: "monthly",
		needsInvoice: false,
		paymentMethod: "card",
		termsAccepted: false,
		newsletterSubscribe: true,
	};

	// Create context with custom extensions
	const context = createWizardContext({
		logger: {
			log: console.log,
			error: console.error,
			debug: console.debug,
		},
		api: {
			fetch: async (url: string) => {
				console.log(`API call to: ${url}`);
				return {};
			},
		},
	});

	// Create wizard machine with event handlers
	const wizard = new WizardMachine<SignupWizardData>(
		signupWizard,
		context,
		initialData,
		{
			onStateChange: (state) => {
				console.log("📍 State changed:", {
					step: state.currentStepId,
					isValid: state.isValid,
					errors: state.validationErrors,
				});
			},
			onStepEnter: (stepId, data) => {
				console.log(`→ Entered step: ${stepId}`, {
					snapshot: data,
				});
			},
			onStepLeave: (stepId, data) => {
				console.log(`← Left step: ${stepId}`, {
					snapshot: data,
				});
			},
			onValidation: (result) => {
				if (!result.valid) {
					console.log("❌ Validation failed:", result.errors);
				} else {
					console.log("✅ Validation passed");
				}
			},
			onSubmit: (stepId, data) => {
				console.log(`📤 Submitted step: ${stepId}`, {
					payload: data,
				});
			},
			onComplete: (data) => {
				console.log("🎉 Wizard completed with data:", data);
			},
			onError: (error) => {
				console.error("❗ Error occurred:", error.message);
			},
		},
	);

	// Simulate user interaction
	console.log("\n--- Step 1: Personal Info ---");
	console.log("Current step:", wizard.currentStep.meta?.title);

	// Try to proceed without valid data
	try {
		await wizard.goNext();
	} catch (error) {
		console.log("Expected error - validation failed", error);
	}

	// Update data with valid values
	wizard.updateData((data) => ({
		...data,
		name: "John Doe",
		email: "john@example.com",
		age: 25,
	}));

	// Validate and proceed
	const validation1 = await wizard.validate();
	console.log("Validation result:", validation1);

	await wizard.goNext();

	console.log("\n--- Step 2: Plan Selection ---");
	console.log("Current step:", wizard.currentStep.meta?.title);

	// Select plan with invoice
	wizard.updateData((data) => ({
		...data,
		plan: "pro",
		billingCycle: "yearly",
		needsInvoice: true,
	}));

	await wizard.goNext();

	console.log("\n--- Step 3: Invoice Details ---");
	console.log("Current step:", wizard.currentStep.meta?.title);

	// Fill invoice details
	wizard.updateData((data) => ({
		...data,
		companyName: "Acme Corp",
		taxId: "TAX-123456",
	}));

	await wizard.goNext();

	console.log("\n--- Step 4: Payment ---");
	console.log("Current step:", wizard.currentStep.meta?.title);

	// Add payment info
	wizard.updateData((data) => ({
		...data,
		paymentMethod: "card",
		cardNumber: "4111111111111111",
	}));

	await wizard.goNext();

	console.log("\n--- Step 5: Summary ---");
	console.log("Current step:", wizard.currentStep.meta?.title);

	// Accept terms and complete
	wizard.updateData((data) => ({
		...data,
		termsAccepted: true,
	}));

	await wizard.submit();
	await wizard.goNext(); // This should trigger completion

	console.log("\n--- Final State ---");
	console.log("Final data:", wizard.snapshot.data);
	console.log("Visited steps:", wizard.visited);
}

/**
 * Example: Navigation and step management
 */
async function navigationExample() {
	console.log("\n=== NAVIGATION EXAMPLE ===\n");

	const initialData: OnboardingData = {
		companyName: "",
		industry: "",
		size: "medium",
		integrations: [],
		inviteTeamMembers: false,
		teamEmails: [],
		timezone: "UTC",
		language: "en",
		notifications: {
			email: true,
			slack: false,
			inApp: true,
		},
	};

	const context = createWizardContext();
	const wizard = new WizardMachine<OnboardingData>(
		onboardingWizard,
		context,
		initialData,
	);

	// Check available steps
	console.log("Available steps:", await wizard.getAvailableSteps());

	// Fill initial data
	wizard.setData({
		...initialData,
		companyName: "TechCorp",
		industry: "Technology",
		integrations: ["slack", "api"],
	});

	// Navigate forward
	await wizard.goNext();
	console.log("Current step:", wizard.currentStep.id);

	// Check if we can navigate to specific steps
	console.log(
		"Can go to slack-setup?",
		await wizard.canNavigateToStep("slack-setup"),
	);
	console.log(
		"Can go to api-setup?",
		await wizard.canNavigateToStep("api-setup"),
	);

	// Navigate back
	await wizard.goPrevious();
	console.log("After going back:", wizard.currentStep.id);

	// Jump to specific step (if enabled)
	try {
		await wizard.goToStep("preferences");
	} catch (error) {
		console.log(
			"Cannot jump to preferences - might need to complete required steps first",
			error,
		);
	}

	// Update data to disable conditional step
	wizard.updateData((data) => ({
		...data,
		integrations: [], // Remove integrations
	}));

	// Check available steps again
	console.log(
		"Available steps after update:",
		await wizard.getAvailableSteps(),
	);
	console.log(
		"Can go to slack-setup now?",
		await wizard.canNavigateToStep("slack-setup"),
	);
}

/**
 * Example: Dynamic routing and conditions
 */
async function dynamicRoutingExample() {
	console.log("\n=== DYNAMIC ROUTING EXAMPLE ===\n");

	// Test different paths through the wizard
	const baseData: SignupWizardData = {
		name: "Test User",
		email: "test@example.com",
		age: 30,
		plan: "basic",
		billingCycle: "monthly",
		needsInvoice: false,
		paymentMethod: "card",
		termsAccepted: true,
		newsletterSubscribe: false,
	};

	const testCases: Array<{
		name: string;
		data: Partial<SignupWizardData>;
		expectedPath: string[];
	}> = [
		{
			name: "Basic user path",
			data: {
				plan: "basic",
				needsInvoice: false,
			},
			expectedPath: ["personal", "plan", "payment", "summary"],
		},
		{
			name: "Invoice user path",
			data: {
				plan: "pro",
				needsInvoice: true,
			},
			expectedPath: ["personal", "plan", "invoice", "payment", "summary"],
		},
		{
			name: "Enterprise user path",
			data: {
				plan: "enterprise",
				needsInvoice: false,
			},
			expectedPath: ["personal", "plan", "enterprise-contact", "summary"],
		},
	];

	for (const testCase of testCases) {
		console.log(`\nTesting: ${testCase.name}`);

		const wizardData: SignupWizardData = {
			...baseData,
			...testCase.data,
		};

		const wizard = new WizardMachine<SignupWizardData>(
			signupWizard,
			createWizardContext(),
			wizardData,
		);

		const path = [wizard.currentStep.id];

		// Navigate through the entire wizard
		while (true) {
			const nextStepId = await wizard.resolveNextStep();
			if (!nextStepId) break;

			await wizard.goToStep(nextStepId);
			path.push(wizard.currentStep.id);
		}

		console.log("Actual path:", path);
		console.log("Expected path:", testCase.expectedPath);
		console.log(
			"Match:",
			JSON.stringify(path) === JSON.stringify(testCase.expectedPath)
				? "✅"
				: "❌",
		);
	}
}

// Run examples
async function runAllExamples() {
	try {
		await runSignupWizardExample();
		await navigationExample();
		await dynamicRoutingExample();
	} catch (error) {
		console.error("Error running examples:", error);
	}
}

// Execute if running directly
if (require.main === module) {
	runAllExamples();
}

export { runSignupWizardExample, navigationExample, dynamicRoutingExample };
