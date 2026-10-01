<template>
  <FrappeBottomSheet v-model:open="isOpen" :title="t`Search filters`">
    <div
      class="flex flex-col gap-5 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <section
        v-for="section in sections"
        :key="section.title"
        class="flex flex-col gap-2.5"
      >
        <h3 class="text-sm text-ink-gray-5">{{ section.title }}</h3>
        <div class="flex flex-wrap gap-2">
          <FrappeButton
            v-for="filter in section.filters"
            :key="filter.value"
            size="md"
            :theme="section.theme"
            :variant="isFilterOn(filter.value) ? 'subtle' : 'outline'"
            :aria-pressed="isFilterOn(filter.value)"
            :label="filter.label"
            @click="emit('change', filter.value, !isFilterOn(filter.value))"
          />
        </div>
      </section>
      <FrappeButton
        variant="solid"
        size="lg"
        :label="t`Done`"
        @click="isOpen = false"
      />
    </div>
  </FrappeBottomSheet>
</template>
<script setup lang="ts">
import { t } from 'fyo';
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
} from 'frappe-ui';
import { computed } from 'vue';

type FilterOption = { value: string; label: string };

const props = defineProps<{
  schemaFilters: FilterOption[];
  isFilterOn: (filterName: string) => boolean;
}>();

const emit = defineEmits<{ change: [filterName: string, value: boolean] }>();
const isOpen = defineModel<boolean>('open', { required: true });

const sections = computed(() => [
  {
    title: t`Records`,
    theme: 'gray' as const,
    filters: [
      { value: 'skipTables', label: t`Skip Child Tables` },
      { value: 'skipTransactions', label: t`Skip Transactions` },
    ],
  },
  {
    title: t`Document Types`,
    theme: 'blue' as const,
    filters: props.schemaFilters,
  },
]);
</script>
