<template>
  <div class="flex flex-col gap-3 px-3 py-2.5">
    <!-- Headed like the card's other rows: number, title and, when it opens, a chevron. -->
    <component
      :is="canEdit ? 'button' : 'div'"
      :type="canEdit ? 'button' : undefined"
      class="flex min-h-8 items-center gap-2.5 text-start"
      @click="canEdit && $emit('edit')"
    >
      <span
        class="grid size-5.5 shrink-0 place-items-center rounded-3 bg-surface-gray-2 text-xs-medium tabular-nums text-ink-gray-6"
      >
        {{ (row.idx ?? 0) + 1 }}
      </span>
      <span class="min-w-0 flex-1 truncate text-lg text-ink-gray-8">
        {{ title }}
      </span>
      <span
        v-if="canEdit"
        class="lucide-chevron-right size-4 shrink-0 text-ink-gray-4 rtl-rotate-180"
        aria-hidden="true"
      />
    </component>
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

/** A phone table row as a block in MobileTableRows' card: its title, two fields side by side and a result line. */
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
