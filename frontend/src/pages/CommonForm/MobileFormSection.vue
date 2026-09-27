<template>
  <section v-if="visibleFields.length" class="border-b border-outline-gray-1">
    <button
      v-if="kind === 'collapsible'"
      class="flex h-[52px] w-full items-center gap-2 px-4 text-start text-base-semibold text-ink-gray-9 active:bg-surface-gray-1"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      <span class="min-w-0 flex-1 truncate">{{ title }}</span>
      <span
        v-if="hasError"
        class="size-1.5 rounded-full bg-surface-red-4"
        :aria-label="t`Has errors`"
      />
      <span
        class="lucide-chevron-down size-4 text-ink-gray-5 transition-transform"
        :class="isOpen ? 'rotate-180' : ''"
        aria-hidden="true"
      />
    </button>
    <div
      v-else-if="kind === 'table'"
      class="flex items-baseline justify-between px-4 pb-2 pt-4"
    >
      <h2 class="text-base-semibold text-ink-gray-9">{{ title }}</h2>
      <span class="text-sm text-ink-gray-5">{{ rowCount }}</span>
    </div>

    <Table
      v-if="tableField"
      :data-fieldname="tableField.fieldname"
      :df="tableField"
      :value="(doc[tableField.fieldname] ?? []) as Doc[]"
      :flush="true"
      @editrow="(row: Doc) => $emit('editrow', row)"
      @change="(value: DocValue) => $emit('value-change', tableField!, value)"
      @row-change="
        (field: Field, value: DocValue, parentfield: Field) =>
          $emit('row-change', field, value, parentfield)
      "
    />
    <FrappeErrorMessage
      v-if="tableField"
      class="px-4 pb-3"
      :message="errors[tableField.fieldname]"
    />

    <div
      v-if="fieldGroups.length && (kind !== 'collapsible' || isOpen)"
      class="flex flex-col"
      :class="{
        'gap-4 px-4 pb-4': kind === 'collapsible',
        'gap-4 p-4': kind === 'plain',
        'gap-2.5 p-4 text-md tabular-nums': kind === 'totals',
        'gap-2.5 border-t border-outline-gray-1 p-4 text-md tabular-nums':
          kind === 'table',
      }"
    >
      <template v-for="group in fieldGroups" :key="group[0].fieldname">
        <div v-if="group.length > 1" class="grid grid-cols-2 gap-3">
          <MobileFormField
            v-for="field of group"
            :key="field.fieldname"
            :field="field"
            :doc="doc"
            :error="errors[field.fieldname]"
            @change="(value: DocValue) => $emit('value-change', field, value)"
          />
        </div>
        <template v-else-if="isTotal(group[0])">
          <div
            v-for="line in getTotalLines(group[0])"
            :key="line.label"
            class="flex justify-between gap-3"
            :class="
              line.emphasis
                ? 'border-t border-outline-gray-1 pt-2.5 font-semibold text-ink-gray-9 first:border-t-0 first:pt-0'
                : 'text-ink-gray-8'
            "
            :data-fieldname="group[0].fieldname"
          >
            <span class="min-w-0 truncate">{{ line.label }}</span>
            <span dir="ltr">{{ line.value }}</span>
          </div>
        </template>
        <MobileFormField
          v-else
          :field="group[0]"
          :doc="doc"
          :error="errors[group[0].fieldname]"
          @change="(value: DocValue) => $emit('value-change', group[0], value)"
        />
      </template>
    </div>
  </section>
</template>
<script setup lang="ts">
import { ErrorMessage as FrappeErrorMessage } from 'frappe-ui';
import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { Field, FieldTypeEnum } from 'schemas/types';
import { getRowSummary } from 'src/components/Controls/rowSummary';
import Table from 'src/components/Controls/Table.vue';
import { fyo } from 'src/initFyo';
import { isNumeric } from 'src/utils';
import { evaluateReadOnly, hasFieldValue } from 'src/utils/doc';
import { computed, ref, watch } from 'vue';
import MobileFormField from './MobileFormField.vue';

const props = defineProps<{
  title: string;
  fields: Field[];
  doc: Doc;
  errors: Record<string, string>;
}>();

defineEmits<{
  'value-change': [field: Field, value: DocValue];
  'row-change': [field: Field, value: DocValue, parentfield: Field];
  editrow: [row: Doc];
}>();

const dateTypes: string[] = [FieldTypeEnum.Date, FieldTypeEnum.Datetime];

// Line tables (items) show as rows; read-only summary tables (taxes) as totals.
const tableField = computed(() => props.fields.find(isLineTable));
const kind = computed(() => {
  if (props.title === 'Default') {
    return 'plain';
  }

  if (tableField.value) {
    return 'table';
  }

  return props.fields.every(isTotal) ? 'totals' : 'collapsible';
});

const rowCount = computed(() => {
  const count = (props.doc.get(tableField.value!.fieldname) as Doc[]).length;
  return count === 1 ? t`1 row` : t`${count} rows`;
});

const hasError = computed(() =>
  props.fields.some((field) => props.errors[field.fieldname])
);

// Collapsed sections open when they hold a value or an error.
const isOpen = ref(
  props.fields.some((field) => hasFieldValue(props.doc, field))
);
watch(hasError, (value) => value && (isOpen.value = true), { immediate: true });

/** Consecutive date fields sit two to a row. */
const fieldGroups = computed(() => {
  const groups: Field[][] = [];
  for (const field of visibleFields.value) {
    if (field === tableField.value) {
      continue;
    }

    const previous = groups.at(-1);
    const isDate = dateTypes.includes(field.fieldtype);
    if (
      isDate &&
      previous?.length === 1 &&
      dateTypes.includes(previous[0].fieldtype)
    ) {
      previous.push(field);
    } else {
      groups.push([field]);
    }
  }

  return groups;
});

// A finished document hides its empty fields.
const visibleFields = computed(() => {
  if (!props.doc.isSubmitted && !props.doc.isCancelled) {
    return props.fields;
  }

  return props.fields.filter((field) => hasFieldValue(props.doc, field));
});

function isLineTable(field: Field) {
  return field.fieldtype === FieldTypeEnum.Table && !field.readOnly;
}

function isTotal(field: Field) {
  if (field.fieldtype === FieldTypeEnum.Table) {
    return !!field.readOnly;
  }

  return isNumeric(field) && evaluateReadOnly(field, props.doc);
}

function getTotalLines(field: Field) {
  const emphasis =
    kind.value === 'totals' &&
    field ===
      visibleFields.value
        .filter((f) => f.fieldtype === FieldTypeEnum.Currency)
        .at(-1);

  if (field.fieldtype !== FieldTypeEnum.Table) {
    const value = fyo.format(props.doc.get(field.fieldname), field, props.doc);
    return [{ label: field.label ?? field.fieldname, value, emphasis }];
  }

  const target = (field as { target?: string }).target ?? '';
  const columns = (fyo.schemaMap[target]?.tableFields ?? []).map((fieldname) =>
    fyo.getField(target, fieldname)
  );
  return (props.doc.get(field.fieldname) as Doc[]).map((row) => {
    const { title, meta, amount } = getRowSummary(row, columns);
    return {
      label: [title, meta].filter(Boolean).join(' '),
      value: amount,
      emphasis: false,
    };
  });
}
</script>
