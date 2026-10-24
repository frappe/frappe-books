<template>
  <div class="flex flex-col gap-3 border-b border-outline-gray-1 py-4">
    <button
      v-if="canEdit"
      type="button"
      class="flex items-center gap-2 text-start text-lg-semibold text-ink-gray-8"
      @click="$emit('edit')"
    >
      <span class="min-w-0 flex-1 truncate">{{ title }}</span>
      <span
        class="lucide-chevron-right size-4 shrink-0 text-ink-gray-4 rtl-rotate-180"
        aria-hidden="true"
      />
    </button>
    <h3 v-else class="truncate text-lg-semibold text-ink-gray-8">
      {{ title }}
    </h3>
    <div class="grid grid-cols-2 gap-3">
      <MobileFormField
        v-for="field of fields"
        :key="field.fieldname"
        :field="field"
        :doc="row"
        :error="errors[field.fieldname]"
        @change="(value: DocValue) => setValue(field, value)"
      />
    </div>
    <div
      v-if="result"
      class="flex justify-between gap-3 text-base"
      :data-fieldname="result.fieldname"
    >
      <span class="text-ink-gray-6">{{ result.label }}</span>
      <span class="tabular-nums" :class="resultInk" dir="ltr">
        {{ resultValue }}
      </span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import type { Field } from 'schemas/types';
import { isCalculating } from 'src/frappe/calculated';
import type { FrappeDoc } from 'src/frappe/document';
import { fyo } from 'src/initFyo';
import MobileFormField from 'src/pages/CommonForm/MobileFormField.vue';
import { getErrorMessage } from 'src/utils';
import { computed, provide, reactive } from 'vue';
import { isRedAmount } from './rowSummary';

/** A phone table row as a block: its title, two fields side by side and a result line. */
const props = defineProps<{
  row: FrappeDoc;
  title: string;
  fields: Field[];
  result?: Field;
  /** Whether the title opens the row's sheet, for rows that can be removed. */
  canEdit: boolean;
}>();

const emit = defineEmits<{
  edit: [];
  change: [field: Field, value: DocValue];
}>();

provide(
  'doc',
  computed(() => props.row)
);

const errors = reactive<Record<string, string>>({});

const resultValue = computed(() => {
  const field = props.result;
  if (!field) {
    return '';
  }

  if (isCalculating(props.row, field)) {
    return t`Calculating…`;
  }

  return fyo.format(props.row.get(field.fieldname), field, props.row);
});

const resultInk = computed(() =>
  props.result && isRedAmount(props.row, props.result)
    ? 'text-ink-red-6'
    : 'text-ink-gray-8'
);

async function setValue(field: Field, value: DocValue) {
  delete errors[field.fieldname];
  try {
    await props.row.set(field.fieldname, value);
    emit('change', field, value);
  } catch (error) {
    errors[field.fieldname] = getErrorMessage(error as Error, props.row);
  }
}
</script>
