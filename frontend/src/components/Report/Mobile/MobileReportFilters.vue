<template>
  <FrappeBottomSheet v-model:open="open" :title="t`Filters`">
    <div class="flex flex-col gap-4 px-4">
      <FormControl
        v-for="field in report.filters"
        :key="field.fieldname"
        :border="true"
        :show-label="true"
        :df="field"
        :layout="field.fieldtype === 'Check' ? 'inline' : undefined"
        :value="report.get(field.fieldname)"
        @change="(value: DocValue) => setFilter(field.fieldname, value)"
      />
      <footer
        class="sticky bottom-0 -mx-4 grid grid-cols-2 gap-2 bg-surface-base px-4 pt-2 pb-[max(env(safe-area-inset-bottom),1rem)]"
      >
        <FrappeButton size="lg" :label="t`Clear`" @click="clear" />
        <FrappeButton
          size="lg"
          variant="solid"
          :label="t`Apply`"
          @click="apply"
        />
      </footer>
    </div>
  </FrappeBottomSheet>
</template>
<script setup lang="ts">
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
} from 'frappe-ui';
import type { DocValue } from 'fyo/core/types';
import type { Report } from 'reports/Report';
import FormControl from 'src/components/Controls/FormControl.vue';
import { watch } from 'vue';
import { getFilterValues, type FilterValues } from './MobileFilters';

const props = defineProps<{ report: Report; defaults: FilterValues }>();
const emit = defineEmits<{ apply: [] }>();
const open = defineModel<boolean>('open', { required: true });

// Edits change the report's filters at once; closing without Apply undoes them.
let snapshot: FilterValues = {};
let isApplied = false;

watch(open, async (isOpen) => {
  if (isOpen) {
    snapshot = getFilterValues(props.report);
    isApplied = false;
  } else if (!isApplied) {
    await props.report.setFilters(snapshot);
  }
});

async function setFilter(fieldname: string, value: DocValue) {
  await props.report.set(fieldname, value, false);
  await props.report.refreshFilters();
}

async function clear() {
  await props.report.setFilters(props.defaults);
}

function apply() {
  isApplied = true;
  open.value = false;
  emit('apply');
}
</script>
