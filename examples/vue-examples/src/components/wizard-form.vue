<script setup lang="ts">
import { computed } from "vue";
import Alert from "@/components/ui/alert.vue";
import Card from "@/components/ui/card.vue";
import Checkbox from "@/components/ui/checkbox.vue";
import Input from "@/components/ui/input.vue";
import Label from "@/components/ui/label.vue";
import ValidationMessage from "@/components/ui/validation-message.vue";

interface Props {
	currentStepId: string;
	data: Record<string, unknown>;
	validationErrors: Record<string, string> | undefined;
	onFieldChange: (field: string, value: unknown) => void;
}

const props = defineProps<Props>();

const currentStepConfig = computed(() => {
	const stepConfig: Record<string, { fields: string[]; title: string }> = {
		personal: {
			fields: ["firstName", "lastName", "email", "phone"],
			title: "Personal Information",
		},
		preferences: {
			fields: ["newsletter", "notifications", "theme"],
			title: "Preferences",
		},
		account: {
			fields: ["username", "password", "confirmPassword"],
			title: "Account Setup",
		},
		business: {
			fields: ["companyName", "companySize"],
			title: "Business Details",
		},
		plan: {
			fields: ["plan"],
			title: "Select Plan",
		},
		contact: {
			fields: ["message"],
			title: "Contact Information",
		},
		review: {
			fields: [],
			title: "Review",
		},
	};
	return stepConfig[props.currentStepId] || { fields: [], title: "" };
});

const fieldLabels: Record<string, string> = {
	firstName: "First Name",
	lastName: "Last Name",
	email: "Email",
	phone: "Phone",
	newsletter: "Newsletter",
	notifications: "Notifications",
	theme: "Theme",
	username: "Username",
	password: "Password",
	confirmPassword: "Confirm Password",
	companyName: "Company Name",
	companySize: "Company Size",
	plan: "Plan",
	message: "Message",
};

const getFieldError = (field: string): string => {
	return props.validationErrors?.[field] || "";
};

const filteredFields = computed(() =>
	currentStepConfig.value.fields.filter(
		(f) =>
			!["newsletter", "notifications", "theme", "companySize", "plan"].includes(
				f,
			),
	),
);

type ModelValue = string | number | readonly string[] | null | undefined;
type StringOrUndefined = string | undefined;

const getFieldType = (field: string): string => {
	if (field === "email") return "email";
	if (field === "phone") return "tel";
	if (field === "password" || field === "confirmPassword") return "password";
	return "text";
};

const getSelectOptions = (field: string): string[] => {
	if (field === "theme") return ["light", "dark", "system"];
	if (field === "companySize") return ["1-10", "11-50", "51-200", "200+"];
	if (field === "notifications") return ["email", "sms", "none"];
	if (field === "plan")
		return ["free", "starter", "professional", "enterprise"];
	return [];
};
</script>

<template>
	<div>
		<h2 class="text-2xl font-semibold text-gray-900 mb-6">
			{{ currentStepConfig.title }}
		</h2>

		<!-- Review Step -->
		<div v-if="currentStepId === 'review'">
			<Card>
				<div class="p-6">
					<Alert>
						<h3 class="font-semibold text-gray-900">Review Your Information</h3>
						<p class="text-sm text-gray-600 mt-1">
							Please review your information before submitting
						</p>
					</Alert>

					<div class="grid grid-cols-2 gap-4 py-4">
						<div>
							<p class="text-sm text-gray-600">First Name</p>
							<p class="font-semibold">{{ data.firstName || "-" }}</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Last Name</p>
							<p class="font-semibold">{{ data.lastName || "-" }}</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Email</p>
							<p class="font-semibold">{{ data.email || "-" }}</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Phone</p>
							<p class="font-semibold">{{ data.phone || "-" }}</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Newsletter</p>
							<p class="font-semibold">{{ data.newsletter ? "Subscribed" : "Not subscribed" }}</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Notifications</p>
							<p class="font-semibold capitalize">{{ data.notifications || "-" }}</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Theme</p>
							<p class="font-semibold capitalize">{{ data.theme || "-" }}</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Username</p>
							<p class="font-semibold">{{ data.username || "-" }}</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Company Name</p>
							<p class="font-semibold">{{ data.companyName || "-" }}</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Company Size</p>
							<p class="font-semibold">{{ data.companySize || "-" }}</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Plan</p>
							<p class="font-semibold capitalize">{{ data.plan || "-" }}</p>
						</div>
						<div v-if="data.plan === 'enterprise'" class="col-span-2">
							<p class="text-sm text-gray-600">Message</p>
							<p class="font-semibold">{{ data.message || "-" }}</p>
						</div>
					</div>
				</div>
			</Card>
		</div>

		<!-- Form Steps -->
		<div v-else class="space-y-4">
			<!-- Newsletter Checkbox -->
			<div v-if="currentStepConfig.fields.includes('newsletter')" class="flex items-center gap-3">
				<Checkbox
					id="newsletter"
					:checked="data.newsletter === true"
					@update:checked="(checked: boolean) => onFieldChange('newsletter', checked)"
				/>
				<Label for="newsletter">{{ fieldLabels.newsletter }}</Label>
				<ValidationMessage v-if="getFieldError('newsletter')" :message="getFieldError('newsletter')" />
			</div>

			<!-- Notifications Select -->
			<div v-if="currentStepConfig.fields.includes('notifications')" class="space-y-2">
				<Label for="notifications">{{ fieldLabels.notifications }}</Label>
				<select
					id="notifications"
					:value="data.notifications"
					@change="(e: Event) => onFieldChange('notifications', (e.target as HTMLSelectElement).value)"
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<option v-for="option in getSelectOptions('notifications')" :key="option" :value="option">
						{{ option }}
					</option>
				</select>
				<ValidationMessage v-if="getFieldError('notifications')" :message="getFieldError('notifications')" />
			</div>

			<!-- Theme Select -->
			<div v-if="currentStepConfig.fields.includes('theme')" class="space-y-2">
				<Label for="theme">{{ fieldLabels.theme }}</Label>
				<select
					id="theme"
					:value="data.theme"
					@change="(e: Event) => onFieldChange('theme', (e.target as HTMLSelectElement).value)"
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<option v-for="option in getSelectOptions('theme')" :key="option" :value="option">
						{{ option }}
					</option>
				</select>
				<ValidationMessage v-if="getFieldError('theme')" :message="getFieldError('theme')" />
			</div>

			<!-- Company Size Select -->
			<div v-if="currentStepConfig.fields.includes('companySize')" class="space-y-2">
				<Label for="companySize">{{ fieldLabels.companySize }}</Label>
				<select
					id="companySize"
					:value="data.companySize"
					@change="(e: Event) => onFieldChange('companySize', (e.target as HTMLSelectElement).value)"
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<option v-for="option in getSelectOptions('companySize')" :key="option" :value="option">
						{{ option }}
					</option>
				</select>
				<ValidationMessage v-if="getFieldError('companySize')" :message="getFieldError('companySize')" />
			</div>

			<!-- Plan Select -->
			<div v-if="currentStepConfig.fields.includes('plan')" class="space-y-2">
				<Label for="plan">{{ fieldLabels.plan }}</Label>
				<select
					id="plan"
					:value="data.plan"
					@change="(e: Event) => onFieldChange('plan', (e.target as HTMLSelectElement).value)"
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<option v-for="option in getSelectOptions('plan')" :key="option" :value="option">
						{{ option }}
					</option>
				</select>
				<ValidationMessage v-if="getFieldError('plan')" :message="getFieldError('plan')" />
			</div>

			<!-- Text/Password Inputs -->
			<div v-for="field in filteredFields" :key="field" class="space-y-2">
				<Label :for="field">{{ fieldLabels[field] }}</Label>

				<!-- Message Textarea -->
				<textarea
					v-if="field === 'message'"
					:id="field"
					:value="data[field] as ModelValue"
					@input="(e: Event) => onFieldChange(field, (e.target as HTMLTextAreaElement).value)"
					class="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					placeholder="Enter your message for our sales team"
				/>

				<!-- Regular Input -->
				<Input
					v-else
					:id="field"
					:type="getFieldType(field)"
					:model-value="data[field] as StringOrUndefined"
					@update:model-value="(newValue: unknown) => onFieldChange(field, newValue)"
				/>

				<ValidationMessage v-if="getFieldError(field)" :message="getFieldError(field)" />
			</div>
		</div>
	</div>
</template>
