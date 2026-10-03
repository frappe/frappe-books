<template>
  <MobileFieldTrigger :display-value="modelValue ?? ''" @click="isOpen = true">
    <template #prefix>
      <span class="text-base text-ink-gray-5">{{ t`Template` }}</span>
    </template>
  </MobileFieldTrigger>
  <MobileOptionsSheet
    v-model:open="isOpen"
    :title="t`Print Template`"
    :options="templates.map((name) => ({ label: name, value: name }))"
    :value="modelValue"
    @select="(value) => emit('update:modelValue', String(value))"
  />
</template>
<script setup lang="ts">
import MobileFieldTrigger from 'src/mobile/MobileFieldTrigger.vue';
import MobileOptionsSheet from 'src/mobile/MobileOptionsSheet.vue';
import { ref } from 'vue';

defineProps<{ modelValue: string | null; templates: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const isOpen = ref(false);
</script>
