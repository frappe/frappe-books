<template>
  <button
    type="button"
    class="flex h-10 w-full items-center gap-2 rounded-5 bg-surface-gray-2 px-3 text-start"
    @click="isOpen = true"
  >
    <span class="text-base text-ink-gray-5">{{ t`Template` }}</span>
    <span class="min-w-0 flex-1 truncate text-lg text-ink-gray-8">
      {{ modelValue }}
    </span>
    <span
      class="lucide-chevrons-up-down size-4 text-ink-gray-5"
      aria-hidden="true"
    />
  </button>
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
