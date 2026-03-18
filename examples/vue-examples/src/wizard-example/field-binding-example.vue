<script setup lang="ts">
import {
  combineValidators,
  createLinearWizard,
  createValidator,
  requiredFields,
} from '@gooonzick/wizard-core'
import { useWizard, useWizardField } from '@gooonzick/wizard-vue'
import { computed } from 'vue'
import Alert from '@/components/ui/alert.vue'
import Button from '@/components/ui/button.vue'
import Card from '@/components/ui/card.vue'
import Input from '@/components/ui/input.vue'
import Label from '@/components/ui/label.vue'
import Select from '@/components/ui/select.vue'
import ValidationMessage from '@/components/ui/validation-message.vue'

type FieldBindingData = {
  firstName: string
  email: string
  companyName: string
  plan: '' | 'starter' | 'pro' | 'enterprise'
  notes: string
}

const fieldBindingWizard = createLinearWizard<FieldBindingData>({
  id: 'field-binding-demo',
  steps: [
    {
      id: 'profile',
      title: 'Profile',
      validate: async (data, ctx) =>
        combineValidators(
          requiredFields<FieldBindingData>('firstName', 'email'),
          createValidator(
            (wizardData) => wizardData.email.includes('@'),
            'Please enter a valid email address',
            'email',
          ),
        )(data, ctx),
    },
    {
      id: 'workspace',
      title: 'Workspace',
      validate: async (data, ctx) =>
        requiredFields<FieldBindingData>('companyName', 'plan')(data, ctx),
    },
    {
      id: 'review',
      title: 'Review',
    },
  ],
})

const planOptions = [
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

const stepTitles: Record<string, string> = {
  profile: 'Profile',
  workspace: 'Workspace',
  review: 'Review',
}

const wizard = useWizard<FieldBindingData>({
  definition: fieldBindingWizard,
  initialData: {
    firstName: '',
    email: '',
    companyName: '',
    plan: '',
    notes: '',
  },
  onComplete: (finalData) => {
    console.log('Wizard Completed (Field Binding)!', finalData)
    alert('Field binding example completed! Check console for data.')
  },
})

const { actions, loading, navigation, state, validation } = wizard

const firstName = useWizardField(wizard, 'firstName')
const email = useWizardField(wizard, 'email')
const companyName = useWizardField(wizard, 'companyName')
const plan = useWizardField(wizard, 'plan')
const notes = useWizardField(wizard, 'notes')

const currentStepTitle = computed(() => {
  return stepTitles[state.currentStepId.value] ?? state.currentStepId.value
})

const errorFor = (field: keyof FieldBindingData): string => {
  return validation.validationErrors.value?.[field] ?? ''
}

const updateFirstName = (value: string) => {
  firstName.value = value
}

const updateEmail = (value: string) => {
  email.value = value
}

const updateCompanyName = (value: string) => {
  companyName.value = value
}

const updatePlan = (value: string) => {
  plan.value = value as FieldBindingData['plan']
}

const updateNotes = (event: Event) => {
  notes.value = (event.target as HTMLTextAreaElement).value
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8 px-4">
    <div class="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Vue Wizard (useWizardField)</h1>
        <p class="text-gray-600 mt-2">
          A focused example of machine-owned state with direct `v-model` bindings.
        </p>
      </div>

      <Alert>
        <div class="space-y-2">
          <p class="font-semibold text-gray-900">
            This demo uses `useWizardField()` for every input.
          </p>
          <p class="text-sm text-gray-600">
            The inputs still write through the wizard machine, so there is no mirrored reactive form
            object and no deep watcher sync loop.
          </p>
        </div>
      </Alert>

      <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card class="p-8 space-y-6">
          <div class="flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
            <div>
              <p class="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
                Current Step
              </p>
              <h2 class="text-2xl font-semibold text-gray-900">
                {{ currentStepTitle }}
              </h2>
            </div>
            <div class="text-sm text-gray-500">
              {{ state.currentStepId.value }}
            </div>
          </div>

          <div v-if="state.currentStepId.value === 'profile'" class="space-y-4">
            <div class="space-y-2">
              <Label for="first-name">First Name</Label>
              <Input
                id="first-name"
                :model-value="firstName"
                placeholder="Ada"
                :error="Boolean(errorFor('firstName'))"
                @update:model-value="updateFirstName"
              />
              <ValidationMessage v-if="errorFor('firstName')" :message="errorFor('firstName')" />
            </div>

            <div class="space-y-2">
              <Label for="email">Email</Label>
              <Input
                id="email"
                :model-value="email"
                type="email"
                placeholder="ada@example.com"
                :error="Boolean(errorFor('email'))"
                @update:model-value="updateEmail"
              />
              <ValidationMessage v-if="errorFor('email')" :message="errorFor('email')" />
            </div>
          </div>

          <div v-else-if="state.currentStepId.value === 'workspace'" class="space-y-4">
            <div class="space-y-2">
              <Label for="company-name">Company Name</Label>
              <Input
                id="company-name"
                :model-value="companyName"
                placeholder="Analytical Engines Ltd"
                :error="Boolean(errorFor('companyName'))"
                @update:model-value="updateCompanyName"
              />
              <ValidationMessage
                v-if="errorFor('companyName')"
                :message="errorFor('companyName')"
              />
            </div>

            <div class="space-y-2">
              <Label for="plan">Plan</Label>
              <Select
                id="plan"
                :model-value="plan"
                :items="planOptions"
                placeholder="Choose a plan"
                @update:model-value="updatePlan"
              />
              <ValidationMessage v-if="errorFor('plan')" :message="errorFor('plan')" />
            </div>

            <div class="space-y-2">
              <Label for="notes">Notes</Label>
              <textarea
                id="notes"
                :value="notes"
                class="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="What do you want this wizard to prove out?"
                @input="updateNotes"
              />
            </div>
          </div>

          <div v-else class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p class="text-sm text-gray-500">First Name</p>
                <p class="mt-1 font-semibold text-gray-900">{{ firstName || '-' }}</p>
              </div>
              <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p class="text-sm text-gray-500">Email</p>
                <p class="mt-1 font-semibold text-gray-900">{{ email || '-' }}</p>
              </div>
              <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p class="text-sm text-gray-500">Company</p>
                <p class="mt-1 font-semibold text-gray-900">{{ companyName || '-' }}</p>
              </div>
              <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p class="text-sm text-gray-500">Plan</p>
                <p class="mt-1 font-semibold text-gray-900">{{ plan || '-' }}</p>
              </div>
            </div>

            <div class="rounded-lg border border-dashed border-gray-300 p-4">
              <p class="text-sm text-gray-500">Notes</p>
              <p class="mt-2 text-sm leading-6 text-gray-700">
                {{ notes || 'No notes captured.' }}
              </p>
            </div>
          </div>

          <div class="flex gap-3 pt-2">
            <Button
              variant="outline"
              @click="navigation.goPrevious"
              :disabled="!navigation.canGoPrevious.value || loading.isNavigating.value"
            >
              Previous
            </Button>

            <Button
              v-if="!navigation.isLastStep.value"
              @click="navigation.goNext"
              :disabled="!navigation.canGoNext.value || loading.isNavigating.value"
            >
              Next
            </Button>

            <Button
              v-else
              class="bg-green-600 hover:bg-green-700"
              @click="actions.submit"
              :disabled="loading.isSubmitting.value"
            >
              Complete
            </Button>
          </div>
        </Card>

        <Card class="p-6 space-y-4">
          <h3 class="text-lg font-semibold text-gray-900">Why This Tab Exists</h3>
          <ul class="space-y-3 text-sm leading-6 text-gray-600">
            <li>
              `useWizardField()` gives you a writable computed per field, so `v-model` stays
              ergonomic.
            </li>
            <li>
              Every write still goes through the wizard adapter, so validation and navigation stay
              machine-driven.
            </li>
            <li>
              This avoids cloning the entire form state into a second reactive object and trying to
              sync it back with watchers.
            </li>
          </ul>

          <div class="rounded-lg bg-gray-950 p-4 text-sm text-gray-100">
            <pre class="whitespace-pre-wrap">
const email = useWizardField(wizard, "email")
&lt;Input v-model="email" /&gt;</pre
            >
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>
