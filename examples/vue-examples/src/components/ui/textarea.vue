<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  placeholder?: string
  disabled?: boolean
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()

const model = defineModel()

const textareaClasses = computed(() =>
  cn(
    'flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
    props.class,
  ),
)

function onInput(event: Event) {
  model.value = (event.target as HTMLTextAreaElement).value
}
</script>

<template>
  <textarea
    :class="textareaClasses"
    :value="(model as string)"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="onInput"
  />
</template>
