<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

interface SelectItem {
  value: string
  label: string
}

interface Props {
  items?: SelectItem[]
  placeholder?: string
  disabled?: boolean
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  items: () => [],
  placeholder: 'Select...',
  disabled: false,
})

const model = defineModel()

const selectClasses = computed(() =>
  cn(
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
    props.class,
  ),
)

const handleChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  model.value = target.value
}
</script>

<template>
  <select :class="selectClasses" :value="(model as string)" :disabled="disabled" @change="handleChange">
    <option v-if="placeholder && !model" value="" disabled selected>
      {{ placeholder }}
    </option>
    <option v-for="item in items" :key="item.value" :value="item.value">
      {{ item.label }}
    </option>
  </select>
</template>
