<template>
  <MobileFieldTrigger :display-value="modelValue ?? ''" @click="isOpen = true">
    <template #prefix>
      <span class="text-base text-ink-gray-5">{{ t`Template` }}</span>
    </template>
  </MobileFieldTrigger>
  <FrappeBottomSheet v-model:open="isOpen" :title="t`Print Template`">
    <div
      role="listbox"
      class="flex flex-col px-2 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <MobileSheetRow
        v-for="template in templates"
        :key="template"
        role="option"
        :aria-selected="template === modelValue"
        :label="template"
        :checked="template === modelValue"
        @click="pick(template)"
      />
    </div>
  </FrappeBottomSheet>
</template>
<script setup lang="ts">
import { BottomSheet as FrappeBottomSheet } from 'frappe-ui';
import MobileFieldTrigger from 'src/mobile/MobileFieldTrigger.vue';
import MobileSheetRow from 'src/mobile/MobileSheetRow.vue';
import { ref } from 'vue';

defineProps<{ modelValue: string | null; templates: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const isOpen = ref(false);

function pick(template: string) {
  isOpen.value = false;
  emit('update:modelValue', template);
}
</script>
