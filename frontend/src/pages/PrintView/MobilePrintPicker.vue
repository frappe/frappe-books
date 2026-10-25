<template>
  <MobileFieldTrigger :display-value="displayValue" @click="isOpen = true">
    <template #prefix>
      <span class="text-base text-ink-gray-5">{{ label }}</span>
    </template>
  </MobileFieldTrigger>
  <MobileOptionsSheet
    v-model:open="isOpen"
    :title="title"
    :options="options"
    :value="modelValue"
    @select="(value) => emit('update:modelValue', String(value))"
  />
</template>
<script setup lang="ts">
import MobileFieldTrigger from 'src/mobile/MobileFieldTrigger.vue';
import MobileOptionsSheet, {
  type SheetOption,
} from 'src/mobile/MobileOptionsSheet.vue';
import { computed, ref } from 'vue';

/** A print choice, e.g. the template, as a field that opens an options sheet. */
const props = defineProps<{
  label: string;
  title: string;
  options: SheetOption[];
  modelValue: string | null;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const isOpen = ref(false);
const displayValue = computed(
  () =>
    props.options.find(({ value }) => value === props.modelValue)?.label ??
    props.modelValue ??
    ''
);
</script>
